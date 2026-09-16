# Apply runbook: live project → current HEAD

For the moment the live project (`zyojaoyatunjwgbivaqu`) unpauses. Written
2026-09-16 by T1. **Every live apply is an owner decision.** This file is the
order, not the approval.

Two of these steps (049, 051) take the app down if applied before the client deploy. Each one says so
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
- `select pg_get_expr(polwithcheck, polrelid) from pg_policy where polname = 'add own friendships';`
  should print exactly `(is_permanent_user() AND (person_id = ( SELECT uid() AS uid)))`,
  which is 028's policy as Postgres renders it (it drops the `auth.` prefix).
- `select proowner::regrole from pg_proc where proname = 'mirror_friendship';`
- `select has_table_privilege('authenticated','public.friendships','insert');`

## 1. The order

**Rehearsed end to end on 2026-09-16** against a throwaway Postgres + PostgREST
v16.1 built at the live-through-045 state, with an old client (today's
`select("*")` and `.eq("created_by_user_id")` reads) and the new client (T2's
changes) run after every step. See §4.

Apply each file whole, one at a time. Never run `schema.sql` against live: it
DROPs every table. **One client deploy**, in the middle:

| Step | Do | Precondition | Verify (paste as-is) |
|---|---|---|---|
| 1 | apply `migration-047-delete-plan.sql` | preflight ok | `select to_regproc('public.delete_plan') is not null and not has_function_privilege('anon','public.delete_plan(uuid,text)','execute');` → `t` |
| 2 | apply `migration-048-friendship-consent.sql` | owner has decided about existing `friendships` rows (048 leaves them untouched) | `select not exists(select 1 from pg_policies where tablename='friendships' and policyname='add own friendships') and not has_table_privilege('authenticated','public.friendships','insert') and (select count(*) from pg_proc where proname in ('create_friend_invite','preview_friend_invite','redeem_friend_invite')) = 3;` → `t` |
| 3 | apply `migration-050-owner-reads-without-uid.sql` | none (additive; old client unaffected, rehearsed) | `select to_regproc('public.my_custom_spots') is not null and to_regproc('public.count_my_hosted_plans') is not null and has_function_privilege('authenticated','public.execute_plan_command(uuid,text,text,jsonb)','execute') and not has_function_privilege('anon','public.execute_plan_command(uuid,text,text,jsonb)','execute');` → `t` |
| 4 | **deploy the client** with ALL of T2's changes | steps 1–3 applied (the new client calls 050's RPCs) | run the **step 4 gate** below on the deployed sha, then on the live site: a plan page shows votes, RSVPs and ratings; home shows visit history; start-plan shows saved places |
| 5 | apply `migration-049-hide-voter-user-id.sql` | ⚠ **step 4 deployed and checked**. Otherwise the plan page's votes/RSVPs/ratings reads are refused. | `select not has_column_privilege('authenticated','public.votes','user_id','select') and has_column_privilege('authenticated','public.votes','participant_token_hash','select');` → `t`; then cast a vote on the live site |
| 6 | apply `migration-051-hide-creator-user-id.sql` | ⚠ **step 4 deployed and checked** | `select not has_column_privilege('authenticated','public.spots','created_by_user_id','select') and not has_column_privilege('authenticated','public.plans','created_by_user_id','select') and has_column_privilege('anon','public.spots','name','select');` → `t`; then `GET /api/health` → 200, and re-check the three pages from step 4 |
| 7 | photos: `migration-046-*` (supersedes 039) | ⚠ owner approved the contact sheet **and** uploaded the files to `spot-photos`. A `photo_url` pointing at a missing file is worse than null. | every new `photo_url` returns 200 |

**Step 4 gate.** Run in the repo, with `SHA` set to the deployed commit. Every
line must print `ok`; any `BLOCK` means do not apply 049/051:

```sh
SHA=<deployed-sha>
for f in "app/plan/[id]/page.tsx" lib/social.ts components/StartPlanForm.tsx; do git cat-file -e "${SHA}:$f" 2>/dev/null && echo ok || echo "BLOCK: $f missing at $SHA"; done
git merge-base --is-ancestor 4d074b3 "$SHA" && echo ok || echo "BLOCK: votes/rsvps/ratings column lists (4d074b3) not deployed"
git merge-base --is-ancestor b8b19c7 "$SHA" && echo ok || echo "BLOCK: plans column list + visit spot embed (b8b19c7) not deployed"
[ "$(git show "${SHA}:app/plan/[id]/page.tsx" | grep -cE 'from\("(votes|rsvps|ratings)"\)\.select\("\*"\)')" = 0 ] && echo ok || echo "BLOCK: votes/rsvps/ratings select(*)"
[ "$(git show "${SHA}:app/plan/[id]/page.tsx" | grep -A2 'from("plans")' | grep -c 'select("\*")')" = 0 ] && echo ok || echo "BLOCK: plans select(*)"
[ "$(git show "${SHA}:lib/social.ts" | grep -c 'spots(\*)')" = 0 ] && echo ok || echo "BLOCK: spots(*) embed"
[ "$({ git show "${SHA}:components/StartPlanForm.tsx"; git show "${SHA}:lib/social.ts"; } | grep -c '\.eq("created_by_user_id"')" = 0 ] && echo ok || echo "BLOCK: saved places / Wrapped still filter on created_by_user_id (need my_custom_spots / count_my_hosted_plans)"
```

`plan_spots` keeps `select("*")` on purpose; 049/051 don't touch it.
Keep the braces in `"${SHA}:path"`: in zsh, `"$SHA:app/..."` is read as a
variable modifier, `git show` fails, and `grep -c` prints `0` — a false pass.

039 stays **held** permanently once 046 exists; do not apply both. Finish with
the §0 preflight: every row `true` except 039.

**"function not found" (PGRST202) right after an apply is transient.**
PostgREST reloads its schema cache on DDL; in the rehearsal one call made
immediately after three back-to-back applies missed and succeeded on retry
within 1.5s. Wait a few seconds, or run `notify pgrst, 'reload schema';`. Do
not treat it as a failed migration.

Record each apply in `worklog.md`'s runbook table the same day, with the verify
output.

## 2. Scripts that break after these steps

- `scripts/load/realtime-fanout.mjs:137` selects `*` on `votes` with a user
  token → breaks after 049.
- `scripts/load/seed-local-stack.mjs:43` selects `*` on `spots` with the anon
  key → breaks after 051.
- `scripts/verify-journey.mjs:514-516` filters plans on `created_by_user_id`
  with a user session → breaks after 051; move it to `count_my_hosted_plans`.

Realtime on plans after 051 is **source-verified, not run**: realtime
v2.129.3 `apply_rls.sql` strips columns per subscriber via
`has_column_privilege` (record and old_record), and
`subscription_check_filters.sql` refuses a filter on an unselectable column.
Confirm with one member-subscribes/host-patches check once a stack is up.

## 3. If a step goes wrong

Each is additive and re-run safe. The grant steps (049, 051) are the ones with
user-visible failure. Their immediate undo (rehearsed: the old client works
again, and re-applying the migration afterwards hides the column again) is to restore table-level SELECT
while the client fix ships:

```sql
grant select on public.votes, public.rsvps, public.ratings to authenticated;  -- undo 049
grant select on public.spots to anon, authenticated; grant select on public.plans to authenticated;  -- undo 051
```

That re-opens the uid exposure it closed, so it is a stopgap, not a fix.

## 4. What the rehearsal proved, and what it did not

Base: `schema.sql` at `ec1c647` (last changed by 045) + seed, plus fixtures
shaped like live (a plan with a member's vote/RSVP carrying `user_id`, a
community custom spot, a visit, a hand-written friendship pair).

- Preflight reads 035–045 `true`, 039 `false`, 047–051 `false`, then all `true`
  at the end.
- Every verify line above returned `t` after its step.
- **The ordering constraints are real:** after 049 the old client's
  votes/RSVPs/ratings `select("*")` are refused; after 051 the old client's
  plans `select("*")`, saved-places and Wrapped `.eq("created_by_user_id")` and
  visit-history `spots(*)` embed are all refused. The new client works at
  every step, and before 049/051 as well.
- Votes and host commands still work after every step. Signed-out curated
  reads (the `/api/health` path) still work after 051.
- Both stopgap undos restore the old client. Re-applying afterwards re-hides.
- Every migration re-runs cleanly a second time.
- The two-deploy order (client change before each grant) also passes (112/112);
  the single-deploy order above passes 32/32.

**Not proven:** the base is an end-state file, not a replay of live's actual
history, so live grants or objects could differ in ways the preflight does not
probe; Realtime column stripping (source-verified only); the client changes
themselves (simulated as the exact PostgREST calls T2 was given, not T2's
committed code); 046 (not written yet).
