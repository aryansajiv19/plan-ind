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
| 052, 054, 055, 056, 057 | **NOT applied** (staged) | not yet asked | order and gates in §1 "Next"; 053 is not written yet |

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
  ('051 creator uid hidden',  not has_column_privilege('authenticated','public.spots','created_by_user_id','select')),
  ('052 names + emoji null',  to_regproc('public.clean_display_name') is not null and exists(select 1 from information_schema.columns where table_schema='public' and table_name='people' and column_name='emoji' and is_nullable='YES')),
  ('054 invite trust signal', coalesce((select prosrc like '%shared_plans%' from pg_proc where proname='preview_friend_invite'), false)),
  ('055 edit_plan',           to_regproc('public.edit_plan') is not null),
  ('056 leave_plan',          to_regproc('public.leave_plan') is not null),
  ('057 reopen_plan',         to_regproc('public.reopen_plan') is not null),
  ('060 delete_my_account',   to_regproc('public.delete_my_account') is not null),
  ('058 creation title guard', coalesce((select prosrc like '%clean_display_name(title_value)%' from pg_proc where proname='create_secure_plan'), false)
                               and coalesce((select prosrc like '%clean_display_name(title_value)%' from pg_proc where proname='create_direct_plan'), false)),
  ('059 birthday fix + gates', to_regproc('public.correct_birth_date') is not null and to_regproc('public.category_age_gates') is not null)
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

Steps 0–3 below are **applied to live** (see "Applied to live"). What remains is
the **Next** table after them.

Original order: **028 → 047 → 048 → 050 → deploy → 049 → 051.** Apply each file whole, one at a time. Never run `schema.sql` against live: it
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

### Next: 052 → 054 → 055 → 056 → 057 → 058 → 059 → 060 → deploy → 049 → 051

052 and 054–059 are **additive for the currently deployed client** (rehearsed,
§4b) and are the **prerequisites of the new client**, which calls their
functions. So they go BEFORE the deploy; 049/051 stay AFTER it.

| Step | Do | Precondition | Verify (paste as-is) |
|---|---|---|---|
| N1 | apply `migration-052-been-edits-and-unrate.sql` | preflight: 028/047/048/050 `t`, 052–057 `f` | `select to_regproc('public.clean_display_name') is not null and to_regproc('public.unrate_plan') is not null and exists(select 1 from pg_policies where tablename='visits' and policyname='edit own visits') and exists(select 1 from pg_constraint where conname='people_display_name_safe') and not has_column_privilege('authenticated','public.visits','spot_id','update');` → `t` |
| N2 | apply `migration-054-invite-trust-and-cap-lock.sql` | N1 | `select (select prosrc like '%shared_plans%' from pg_proc where proname='preview_friend_invite') and (select prosrc like '%pg_advisory_xact_lock%' from pg_proc where proname='create_friend_invite') and not has_function_privilege('anon','public.create_friend_invite()','execute');` → `t` |
| N3 | apply `migration-055-edit-plan.sql` | N2 | `select to_regproc('public.edit_plan') is not null and not has_function_privilege('anon','public.edit_plan(uuid,text,text,timestamptz)','execute');` → `t` |
| N4 | apply `migration-056-leave-plan.sql` | N3 | `select to_regproc('public.leave_plan') is not null and not has_function_privilege('anon','public.leave_plan(uuid)','execute');` → `t` |
| N5 | apply `migration-057-reopen-plan.sql` | N4 | `select to_regproc('public.reopen_plan') is not null and not has_function_privilege('anon','public.reopen_plan(uuid,text,timestamptz)','execute') and exists(select 1 from information_schema.columns where table_schema='public' and table_name='plans' and column_name='reopened_at');` → `t` |
| N5b | apply `migration-058-plan-creation-invisible-titles.sql` | N5 (needs 052's `clean_display_name`); additive for the current client: a normal title still creates via both functions (rehearsed) | `select (select prosrc like '%clean_display_name(title_value)%' from pg_proc where proname='create_secure_plan') and (select prosrc like '%clean_display_name(title_value)%' from pg_proc where proname='create_direct_plan') and has_function_privilege('authenticated','public.create_direct_plan(jsonb,uuid)','execute') and not has_function_privilege('anon','public.create_direct_plan(jsonb,uuid)','execute');` → `t` |
| N5c | apply `migration-059-birth-date-correction-and-age-gates.sql` | N5b (re-creates 058's creation functions); additive for the current client: the age matrix at creation is identical (rehearsed). **Before applying:** `select max(minimum_age) from spots where source = 'curated';` → `21` (the "older" correction bar; a junk value above 21 would block every older correction — stop and fix the spot first) | `select to_regproc('public.correct_birth_date') is not null and category_min_age('nightlife') = 21 and category_min_age('shisha') = 18 and (select count(*) from pg_proc where proname in ('create_secure_plan','create_direct_plan') and prosrc like '%then 21%') = 0 and not has_function_privilege('anon','public.correct_birth_date(date)','execute');` → `t` |
| N5d | apply `migration-060-delete-my-account.sql` | N5c; additive for the current client (new function, one storage SELECT policy, spots FK relaxed to `set null` with the owner rule moved to an INSERT trigger — 0 custom spots live) | `select to_regproc('public.delete_my_account') is not null and not has_function_privilege('anon','public.delete_my_account(boolean)','execute') and (select confdeltype from pg_constraint where conrelid='public.spots'::regclass and contype='f' and conkey::smallint[] = array[(select attnum from pg_attribute where attrelid='public.spots'::regclass and attname='created_by_user_id')]) = 'n' and exists(select 1 from pg_policies where tablename='objects' and policyname='read own visit photo files');` → `t` |
| N6 | **deploy the client** with all of T2's changes | ⚠ N1–N5 applied: the new client calls `unrate_plan`, `edit_plan`, `leave_plan`, `reopen_plan`, `shared_plans` and the NULL-emoji path; deployed first, those features 404 | run the **step 4 gate** below on the deployed sha |
| N7 | apply `migration-049-hide-voter-user-id.sql` | ⚠ N6 deployed and checked | step 5's verify line above |
| N8 | apply `migration-051-hide-creator-user-id.sql` | ⚠ N6 deployed and checked; N5 (057) applied — 051's grant list names `reopened_at` and errors without it | step 6's verify line above, and `select has_column_privilege('authenticated','public.plans','reopened_at','select');` → `t` |

Finish with the §0 preflight: every row `t` except 027 (deferred).

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

## 4b. Rehearsal of "Next" (052 → 054 → 055 → 056 → 057 → deploy → 049 → 051)

2026-09-17, ONE rehearsal from live's current state (rig rebuilt and asserted
equal to live after the 028/047/048/050 applies by 7 schema checksums), real
PostgREST v16.1. **82/82.**

- Preflight read live exactly (027 f, 028–050 t, 049/051 f, 052–057 f); final
  preflight all t except the deferred 027.
- Each migration's own proof suite ran back to back on the same database, in
  order: 052 (70), 054 (15), 055 (27), 056 (24, including the reproduced
  accepted race), 057 (29). All N1–N5 runbook verify lines returned `t`.
- **Additive claim proven:** with 052–057 applied and nothing deployed, the
  current client's reads all still work (votes/plans `select *`, saved places
  and Wrapped by `created_by_user_id`, visit `spots(*)` embed, profile read).
  The new client works too.
- **Old sign-up path after 052** (AuthProfileBridge sends `p_emoji: "?"`): the
  call succeeds, and the profile read returns `emoji` as JSON `null` (not the
  string "null", not "?"). No current client code renders `people.emoji`
  (avatars derive from the name), so nothing displays a literal null.
- After the simulated deploy, 049 + 051: the new client works; the old client's
  four affected reads are refused (the constraint is real); the profile read
  still works.
- 056's suite installs a throwaway lock-first trigger variant for its race test.
  The runner restored the real `enforce_plan_membership` straight after it and
  checked it is not security definer. **Never apply that variant.**

**Finding, NOT on this path (live, pre-existing):** `create_direct_plan` and
`create_secure_plan` accept an invisible-only plan title. Probed on the
live-identical rig with a valid positive control: titles of U+200B and U+200B+ZWJ
were stored (hex `e2808b`, `e2808be2808d`). 055's `edit_plan` refuses them; the
creation functions need their own reviewed migration and an owner go.

**058, rehearsed incrementally on the 052–057 state (16/16):** negative control
(both creation functions accepted a U+200B title), then invisible-only titles
(ZWSP, ZWSP+ZWJ, BOM+NBSP) refused with the existing 22023 'title … required'
error; positive controls: a normal title and a Persian title with an internal
ZWNJ still create via both functions; grants unchanged; re-run clean.

**059, rehearsed incrementally on the 052–058 state (47/47):** a full age matrix
at creation (ages 16/18/20/21 × dinner/shisha/nightlife × both functions) is
identical before and after the CASE → helper swap; corrections follow the
direction rule (17.0→17.99 and 20.0→20.99 refused; a 25-year-old's older typo
allowed; younger allowed; one correction; under-13/future invalid; no_change
doesn't consume it; a curated min-25 spot raises the gate; a custom min-99 spot
doesn't); audit rows (successes and refused crossings) carry no dates;
set_birth_date still write-once. Time zone: the three gate functions pin
`Asia/Dubai`; a caller-set `Prefer: timezone=Etc/GMT+12` moved the age check a
day before 059 (negative control) and no longer does after it. schema.sql
also builds from scratch with 059's objects.

## 6. Deploy environment (backend side)

Names only; values are the owner's. **Build time** (Next inlines `NEXT_PUBLIC_*`,
so adding one later needs a redeploy): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`
still accepted), `NEXT_PUBLIC_SITE_URL` (**a production build fails without
it**), `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (**required now the deployment is
public** — without it the widget silently doesn't render and sign-up has no bot
check; the matching secret lives in Supabase Auth).
**Runtime, server-only:** `SECURITY_CONTROL_SECRET` (**throws in production if
absent**; a value that doesn't match the bcrypt hash in
`public.app_control_secrets` name `server-control` doesn't error — every quota
call returns unavailable and the routes answer 503, log line
`SECURITY CONTROL MISCONFIGURED`), `LEGAL_OPERATOR_NAME`,
`LEGAL_CONTACT_EMAIL`, `LEGAL_JURISDICTION` (**all three fail a production
build** by design, rather than publishing placeholder legal pages), and
`OPENAI_API_KEY` (optional; without it smart search returns 503).
`VERCEL*` are set by the platform. `LOAD_*` and `BASE_URL` are load-harness
only and must not be set on Vercel. **There is no service-role key and none may
be added** — one appearing in the Vercel project is a defect.

**Anonymous sign-ins must stay enabled** (the guest-vote path depends on them),
so quotas keyed on `auth.uid()` can be reset by minting a fresh anonymous user.
That is a spend risk, not a data risk, and today the OpenAI account's free-tier
caps (10/min, 50/day) bound it to a 503. **If billing is ever added to that
account, set a budget cap first** — the per-uid quota will not hold it.

**Rotating `SECURITY_CONTROL_SECRET`:** the upsert in `docs/SECURITY_SETUP.md` is the
whole path (no migration, no RPC). Verify with
`select public.valid_control_secret('THE_NEW_SECRET');` → `t` in the SQL editor
(owner only; execute is revoked from every client role), then create one plan in
the app. Only one secret is valid at a time, so quota'd writes 503 between the
hash update and the new Vercel value going live — do the two back to back, and
clear the statement from the dashboard's SQL history afterwards.

## 7. The 6 fixture plans have zero votes — that is not a bug

2026-09-18, owner-approved: the 45 legacy `user_id is null` rows (25 votes, 17
RSVPs, 3 ratings) on the six pre-043 fixture plans were deleted live, which is
what closed the 053 hijack path. `votes`, `rsvps` and `ratings` are therefore
**empty on live**, while `plans` (6) and `spots` (82) are untouched. A fixture
plan rendering with no votes is that deletion, not a regression. Anything voted
from now on carries a `user_id` and is safe; re-vote on a fixture plan if one is
wanted as a demo.
