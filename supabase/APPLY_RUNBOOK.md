# Apply runbook: live project → current HEAD

For the moment the live project (`zyojaoyatunjwgbivaqu`) unpauses. Written
2026-09-16 by T1. **Every live apply is an owner decision.** This file is the
order, not the approval.

Two of these steps (049, 051) take the app down if applied before the client deploy, and 048 must follow 028. Each one says so
at the top of its own migration file too.

## Applied to live

| Migration | Applied (UTC, verify `t` at) | Approved by | Verified |
|---|---|---|---|
| 028 | 2026-09-16 19:23:38Z | owner (confirmed directly in T1's session) | step 0 verify `t`; both friendship write policies in 028 form |
| 047 | 2026-09-16 19:24:05Z | owner | step 1 verify `t`; anon cannot execute, authenticated can; 6 plans untouched |
| 048 | 2026-09-16 19:24:48Z | owner | step 2 verify `t`; live PostgREST direct insert → `42501 permission denied`; anon invite RPC refused; `friend_invites` RLS on, 0 policies; delete policy still 028 form; 0 friendship rows |
| 050 | 2026-09-16 19:25:37Z | owner | step 3 verify `t`; anon cannot execute new RPCs; `execute_plan_command` return drops uid; signed-out curated spots + categories reads 200 with data; all 11 read policies on plans/plan_spots/votes/rsvps/ratings/spots byte-identical to pre-apply |
| 049, 051 | **NOT applied** | not approved | wait for the Vercel deploy + step 4 gate |
| 052 | **NOT applied** (staged) | not yet asked | pre-apply: `select count(*) from public.people where display_name ~ '[[:cntrl:]]' or display_name ~ ('['||chr(8206)||chr(8207)||chr(8234)||'-'||chr(8238)||chr(8294)||'-'||chr(8297)||']');` must be `0` (the new CHECK scans existing rows); independent of 049/051 |

Preflight immediately before the first apply matched the rehearsal exactly
(same rows, same 7 checksums).

## 0. Preflight: read the catalog, not the ledger

The worklog ledger has been confidently wrong before (026 was recorded as
applied and did not exist, and sign-up was impossible for days). Run this
**read-only** query first and apply only what it reports missing.

```sql
select m, ok from (values
  ('027 name index (deferred, expect false tonight)', to_regclass('public.spots_name_idx') is not null),
  ('028 friendship policies w/o recursion', exists(select 1 from pg_policy where polname='remove own friendships' and pg_get_expr(polqual, polrelid) like '%is_permanent_user%')),
  ('035 rsvp carpool',        exists(select 1 from information_schema.columns where table_schema='public' and table_name='rsvps' and column_name='transport')),
  ('036 moodboards',          to_regclass('public.moodboards') is not null),
  ('038 photo columns',       exists(select 1 from information_schema.columns where table_schema='public' and table_name='spots' and column_name='photo_source')),
  ('039 six curated photos',  (select count(*) = 6 from public.spots where photo_url is not null)),
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

**Live as found on 2026-09-16 (read-only preflight after unpause):** 035–045
`true`, **039 `true`** (6 photos, all 6 files in the bucket), **027 `false`**,
**028 `false`**, 047–051 `false`. The ledger claimed 027/028 applied and 039
held; all three were wrong. Any other result means live has changed since:
stop and re-probe.

**Also checked on live (2026-09-16):** `friendships` 0 rows and `people`
0 rows, so there are no hand-written edges to decide about. `mirror_friendship`
is owned by `postgres`. `authenticated` holds table INSERT on `friendships`
(048 revokes it). **Without 028, every friendship write fails**
(`42P17 infinite recursion detected in policy for relation "friendships"`,
reproduced on a live-identical rig). Reads of people/visits/friendships/photos
do not recurse, and no UI writes friendships today.

**Known stray on live, inert, not on tonight's path:** policy
`plan_spots."advance plan_spots"` (UPDATE, all roles, `using true`) from
migration 009 survives although 015 dropped it. Clients have no UPDATE grant
on `plan_spots`, so it grants nothing today; drop it in a later cleanup
migration.

## 1. The order

**Rehearsed end to end on 2026-09-16** against a throwaway Postgres + PostgREST
v16.1 built at the live-through-045 state, with an old client (today's
`select("*")` and `.eq("created_by_user_id")` reads) and the new client (T2's
changes) run after every step. See §4.

Order: **028 → 047 → 048 → 050 → deploy → 049 → 051.** Apply each file whole, one at a time. Never run `schema.sql` against live: it
DROPs every table. **One client deploy**, in the middle:

| Step | Do | Precondition | Verify (paste as-is) |
|---|---|---|---|
| 0 | apply `migration-028-friendships-rls-recursion.sql` | preflight matches the live state above | `select exists(select 1 from pg_policy where polname='remove own friendships' and pg_get_expr(polqual, polrelid) like '%is_permanent_user%');` → `t` |
| 1 | apply `migration-047-delete-plan.sql` | preflight ok | `select to_regproc('public.delete_plan') is not null and not has_function_privilege('anon','public.delete_plan(uuid,text)','execute');` → `t` |
| 2 | apply `migration-048-friendship-consent.sql` | ⚠ **step 0 applied**. 048 drops only the insert policy; without 028 the leftover delete policy makes unfriending recurse. | `select not exists(select 1 from pg_policies where tablename='friendships' and policyname='add own friendships') and not has_table_privilege('authenticated','public.friendships','insert') and (select count(*) from pg_proc where proname in ('create_friend_invite','preview_friend_invite','redeem_friend_invite')) = 3;` → `t` |
| 3 | apply `migration-050-owner-reads-without-uid.sql` | none (additive; old client unaffected, rehearsed) | `select to_regproc('public.my_custom_spots') is not null and to_regproc('public.count_my_hosted_plans') is not null and has_function_privilege('authenticated','public.execute_plan_command(uuid,text,text,jsonb)','execute') and not has_function_privilege('anon','public.execute_plan_command(uuid,text,text,jsonb)','execute');` → `t` |
| 4 | **deploy the client** with ALL of T2's changes | steps 1–3 applied (the new client calls 050's RPCs) | run the **step 4 gate** below on the deployed sha, then on the live site: a plan page shows votes, RSVPs and ratings; home shows visit history; start-plan shows saved places |
| 5 | apply `migration-049-hide-voter-user-id.sql` | ⚠ **step 4 deployed and checked**. Otherwise the plan page's votes/RSVPs/ratings reads are refused. | `select not has_column_privilege('authenticated','public.votes','user_id','select') and has_column_privilege('authenticated','public.votes','participant_token_hash','select');` → `t`; then cast a vote on the live site |
| 6 | apply `migration-051-hide-creator-user-id.sql` | ⚠ **step 4 deployed and checked** | `select not has_column_privilege('authenticated','public.spots','created_by_user_id','select') and not has_column_privilege('authenticated','public.plans','created_by_user_id','select') and has_column_privilege('anon','public.spots','name','select');` → `t`; then `GET /api/health` → 200, and re-check the three pages from step 4 |
| — | photos: `migration-046-*` — **not on tonight's path** | written only after the owner approves the contact sheet; must be **additive** to the 6 photos 039 already made live, and applied only after its files are in `spot-photos` | every new `photo_url` returns 200 |

**Step 4 gate.** Run in the repo, with `SHA` set to the deployed commit. Every
line must print `ok`; any `BLOCK` means do not apply 049/051:

```sh
SHA=<deployed-sha>
for f in "app/plan/[id]/page.tsx" lib/social.ts components/StartPlanForm.tsx; do git cat-file -e "${SHA}:$f" 2>/dev/null && echo ok || echo "BLOCK: $f missing at $SHA"; done
git merge-base --is-ancestor 4d074b3 "$SHA" && echo ok || echo "BLOCK: votes/rsvps/ratings column lists (4d074b3) not deployed"
git merge-base --is-ancestor b8b19c7 "$SHA" && echo ok || echo "BLOCK: plans column list + visit spot embed (b8b19c7) not deployed"
git merge-base --is-ancestor 7f58c30 "$SHA" && echo ok || echo "BLOCK: saved places / Wrapped RPC swaps (7f58c30) not deployed"
[ "$(git show "${SHA}:app/plan/[id]/page.tsx" | grep -cE 'from\("(votes|rsvps|ratings)"\)\.select\("\*"\)')" = 0 ] && echo ok || echo "BLOCK: votes/rsvps/ratings select(*)"
[ "$(git show "${SHA}:app/plan/[id]/page.tsx" | grep -A2 'from("plans")' | grep -c 'select("\*")')" = 0 ] && echo ok || echo "BLOCK: plans select(*)"
[ "$(git show "${SHA}:lib/social.ts" | grep -c 'spots(\*)')" = 0 ] && echo ok || echo "BLOCK: spots(*) embed"
[ "$({ git show "${SHA}:components/StartPlanForm.tsx"; git show "${SHA}:lib/social.ts"; } | grep -c '\.eq("created_by_user_id"')" = 0 ] && echo ok || echo "BLOCK: saved places / Wrapped still filter on created_by_user_id (need my_custom_spots / count_my_hosted_plans)"
```

`plan_spots` keeps `select("*")` on purpose; 049/051 don't touch it.
Keep the braces in `"${SHA}:path"`: in zsh, `"$SHA:app/..."` is read as a
variable modifier, `git show` fails, and `grep -c` prints `0` — a false pass.

039 is already live; do not re-apply it. 027 (`spots_name_idx`) is **not live
and not superseded**: 040's trigram index serves `ilike` search but cannot
serve `/home`'s `order by name limit 120` (planner sorts even with seq scans
disabled; with 027 it is an index scan). At 82 rows that query runs in 0.13ms,
so 027 is **deferred**, not needed tonight. Finish with the §0 preflight: every
row `true` except 027.

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

Realtime column stripping after 049/051 is proven with a real subscriber; see §4.

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

**Corrected sequence, 2026-09-16, on a rig identical to live's public schema**:
built from `schema.sql@ec1c647` + seeds + migration 039 + live's differences
(007 friendship policies, no 027 index, the stray `plan_spots` policy), then
**asserted equal to live** by 7 checksums read from live (columns, table grants,
function grants, normalized function bodies, indexes, policies, triggers, 175
columns / 314 grants / 26 functions / 69 indexes / 33 policies / 12 triggers),
not assumed. Real PostgREST v16.1. **94/94.**

- The preflight reads exactly live's state (027 f, 028 f, 035–045 t, 039 t,
  047–051 f), and at the end everything is `t` except the deferred 027.
- **Negative controls:** before 028, a real unfriend through PostgREST fails
  with `42P17`. Applying 048 without 028 (in a rolled-back transaction) leaves
  unfriend recursing, so the 028-before-048 constraint is real. Reads don't
  recurse.
- Every verify line in the step table, read from this file, returns `t` after
  its step.
- After 048: the direct-insert exploit is refused; invite → preview (shows the
  inviter) → redeem creates both edges; the friend's visits become readable; **a
  real unfriend succeeds with no recursion**, removes both edges, and the visits
  stop being readable.
- After 050 the old client still works and the new client works (one deploy).
  After 049+051 the new client works and the old client's reads are refused.
  Votes, host commands (no uid in the response) and the signed-out
  `/api/health` read still work.
- Every migration re-runs cleanly. **Re-running 028 alone after 048 recreates
  the insert policy**, but inserts stay refused because 048 revoked the table
  INSERT grant. Still: do not re-run 028 after 048, and re-apply 048 if it
  happens.

Earlier, on the older end-state base: Realtime strips the withheld columns
from live payloads with a real subscriber, including a negative control
(21/21); both stopgap undos restore the old client; the step-4 gate blocks on
every commit before `7f58c30` and passes on it (zsh and bash).

**Not proven:** anything outside the `public` schema's objects and grants
(`storage`, `auth`, `realtime` config on live); the deployed build itself (the
gate proves commits, not deployment); 046 (not written).
