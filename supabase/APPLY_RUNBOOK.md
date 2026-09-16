# Apply runbook: live project → current HEAD

For the moment the live project (`zyojaoyatunjwgbivaqu`) unpauses. Written
2026-09-16 by T1. **Every live apply is an owner decision.** This file is the
order, not the approval.

Two of these steps take the app down if applied out of order. Each one says so
at the top of its own migration file too.

## 0. Preflight: read the catalog, not the ledger

The worklog ledger has been confidently wrong before (026 was recorded as
applied and did not exist, and sign-up was impossible for days). Run this
**read-only** query first and apply only what it reports missing.

```sql
select m, ok from (values
  ('035 rsvp carpool',        exists(select 1 from information_schema.columns where table_schema='public' and table_name='rsvps' and column_name='transport')),
  ('036 moodboards',          to_regclass('public.moodboards') is not null),
  ('038 photo columns',       exists(select 1 from information_schema.columns where table_schema='public' and table_name='spots' and column_name='photo_source')),
  ('039 HELD photos (expect false)', exists(select 1 from public.spots where photo_url is not null)),
  ('040 scale indexes',       to_regclass('public.spots_curated_category_idx') is not null),
  ('041 anon curated read',   exists(select 1 from pg_policies where tablename='spots' and policyname='read curated spots anonymously')),
  ('043 votes.user_id',       exists(select 1 from information_schema.columns where table_schema='public' and table_name='votes' and column_name='user_id')),
  ('044 curated_categories',  to_regclass('public.curated_categories') is not null),
  ('045 replica identity',    (select relreplident='f' from pg_class where oid='public.votes'::regclass)),
  ('047 delete_plan',         to_regproc('public.delete_plan') is not null),
  ('048 friend invites',      to_regclass('public.friend_invites') is not null),
  ('048 insert policy gone',  not exists(select 1 from pg_policies where tablename='friendships' and policyname='add own friendships')),
  ('049 votes.user_id hidden',not has_column_privilege('authenticated','public.votes','user_id','select')),
  ('050 owner RPCs',          to_regproc('public.my_custom_spots') is not null),
  ('051 creator uid hidden',  not has_column_privilege('authenticated','public.spots','created_by_user_id','select'))
) t(m, ok);
```

Expected on unpause: everything through 045 `true` (039 `false`), 047 onwards
`false`. If any row before 047 is `false`, stop: the live state is not what
this runbook assumes.

**Before anything else, also check (owed by source-only audits):**
- `select count(*) from friendships;` — rows here were hand-written (no UI ever
  wrote them) and grant reads of someone's visit history. **Owner decides**
  what to keep before or after 048. Do not purge unasked.
- `select polname, pg_get_expr(polwithcheck, polrelid) from pg_policy where polname = 'add own friendships';`
  should be 028's text (`is_permanent_user() and person_id = auth.uid()`).
- `select proowner::regrole from pg_proc where proname = 'mirror_friendship';`
- `select has_table_privilege('authenticated','public.friendships','insert');`

## 1. The order

Apply each file whole, one at a time, then run its verify line. Never run
`schema.sql` against live: it DROPs every table.

| Step | Apply | Precondition | Verify after |
|---|---|---|---|
| 1 | `migration-047-delete-plan.sql` | none | `select to_regproc('public.delete_plan')` not null; `select has_function_privilege('anon','public.delete_plan(uuid,text)','execute')` = false |
| 2 | `migration-048-friendship-consent.sql` | owner has decided about existing `friendships` rows | insert policy gone; `has_table_privilege('authenticated','public.friendships','insert')` = false; the three invite RPCs exist, anon cannot execute |
| 3 | **Deploy client commit** with `create/preview/redeem` invite calls, if the friends UI ships tonight | — | not required for 048 itself: nothing in the UI wrote friendships |
| 4 | **Deploy client commit** with explicit column lists for `votes`/`rsvps`/`ratings` in `app/plan/[id]/page.tsx` (+ `error` checks on rsvps/ratings) | — | the plan page loads votes, RSVPs and ratings on the deployed build |
| 5 | `migration-049-hide-voter-user-id.sql` | ⚠ **step 4 deployed**. Otherwise the plan page loses its votes. | `has_column_privilege('authenticated','public.votes','user_id','select')` = false; open a plan on the deployed app and cast a vote |
| 6 | `migration-050-owner-reads-without-uid.sql` | none (additive) | `my_custom_spots`, `count_my_hosted_plans` exist; a host command still works |
| 7 | **Deploy client commit**: `StartPlanForm.tsx` → `rpc("my_custom_spots")`, `lib/social.ts` Wrapped count → `rpc("count_my_hosted_plans")`, `lib/social.ts` `VISIT_SELECT`'s `spot:spots(*)` embed → column list (visit history on home), `app/plan/[id]/page.tsx` plans `select("*")` → column list | step 6 applied (the RPCs must exist) | saved places list and the plan page work on the deployed build |
| 8 | `migration-051-hide-creator-user-id.sql` | ⚠ **steps 6 and 7 both deployed**. Otherwise saved places, Wrapped and the plan page fail with "permission denied". | `has_column_privilege('authenticated','public.spots','created_by_user_id','select')` = false; load `/`, `/home`, a plan page, and the start-plan saved places |
| 9 | Photos: `migration-046-*` (supersedes 039) | ⚠ owner approved the contact sheet **and** uploaded the files to the `spot-photos` bucket. A `photo_url` pointing at a missing file is worse than null. | every new `photo_url` returns 200 |

039 stays **held** permanently once 046 exists; do not apply both.

Record each apply in `worklog.md`'s runbook table the same day, with how it
was verified.

## 2. Scripts that break after these steps

- `scripts/load/realtime-fanout.mjs:137` selects `*` on `votes` with a user
  token → breaks after step 5.
- `scripts/load/seed-local-stack.mjs:43` selects `*` on `spots` with the anon
  key → breaks after step 8.
- `scripts/verify-journey.mjs:514-516` filters plans on `created_by_user_id`
  with a user session → breaks after step 8; move it to `count_my_hosted_plans`.

Realtime on plans after step 8 is **source-verified, not run**: realtime
v2.129.3 `apply_rls.sql` strips columns per subscriber via
`has_column_privilege` (record and old_record), and
`subscription_check_filters.sql` refuses a filter on an unselectable column.
Confirm with one member-subscribes/host-patches check once a stack is up.

## 3. If a step goes wrong

Each is additive and re-run safe. The grant steps (5, 8) are the ones with
user-visible failure. Their immediate undo is to restore table-level SELECT
while the client fix ships:

```sql
grant select on public.votes, public.rsvps, public.ratings to authenticated;  -- undo 5
grant select on public.spots to anon, authenticated; grant select on public.plans to authenticated;  -- undo 8
```

That re-opens the uid exposure it closed, so it is a stopgap, not a fix.
