# Deal three worklog

Last updated: 2026-09-16 (Asia/Dubai). Entries from 2026-09-06 and earlier are in `worklog-archive.md`.

## Migration runbook

The single source of truth for what is applied where. Update the status column
the same day you run something — prose scattered through checkpoints stopped
being trustworthy at 014.

Apply in order. Every migration is additive and re-run safe unless noted.

| # | File | Applied to live project |
|---|------|-------------------------|
| 002 | `migration-002-lastmile-categories.sql` | yes |
| 003 | `migration-003-ratings.sql` | yes |
| 004 | `migration-004-swap.sql` | yes |
| 005 | `migration-005-social.sql` | yes |
| 006 | `migration-006-social-hardening.sql` | yes |
| 007 | `migration-007-auth.sql` | yes |
| 008 | `migration-008-expanded-dubai-categories.sql` | yes |
| 009 | `migration-009-pools-custom-spots.sql` | yes — verified live 2026-08-10 |
| 010 | `migration-010-recommendations-collections.sql` | yes |
| 011 | `migration-011-smart-search.sql` | yes |
| 012 | `migration-012-place-link-imports.sql` | yes |
| 013 | `migration-013-age-safe-venues.sql` | yes — 2026-08-09 |
| 014 | `migration-014-secure-plan-creation.sql` | yes — 2026-08-09 |
| 015 | `migration-015-host-plan-commands.sql` | yes — verified live 2026-08-10 |
| 016 | `migration-016-rsvp-choices.sql` | yes — verified live 2026-08-10 |
| 017 | `migration-017-participant-token-seam.sql` | yes — verified live 2026-08-10 |
| 018 | `migration-018-participant-write-rpcs.sql` | yes — verified live 2026-08-10 |
| 019 | `migration-019-secret-isolation-and-rpc-integrity.sql` | yes — verified live 2026-08-10 |
| 020 | `migration-020-production-security.sql` | **yes — applied and verified live 2026-08-24** |
| 021 | `migration-021-revoke-anon-execute.sql` | **yes — applied live 2026-09-01 via Supabase MCP (T0).** anon EXECUTE confirmed absent on the five gated functions; kept on `record_security_event`. |
| 022 | `migration-022-spot-deal-quota-and-guest-realtime.sql` | **yes — applied live 2026-09-01 via Supabase MCP (T0).** `spot-deal` scope (30/min, 300/day) + `plan_spots` in `supabase_realtime`, both verified. |
| 023 | `migration-023-vote-idempotency.sql` | **yes — applied live 2026-09-01 via Supabase MCP (T0)** in corrected form (`drop function` before `create` — the committed file was fixed to match in `67a0ccf`). `votes_participant_round_key` unique index live, `cast_plan_vote` returns jsonb, no vote rows deleted. |
| 024 | `migration-024-revoke-anon-execute-sec4.sql` | **yes — applied live 2026-09-01 via Supabase MCP (T0), owner-approved.** Verified: anon EXECUTE now absent on all 7; `authenticated` kept on the 3 RPCs, dropped on the 4 internal fns; `set_birth_date` body carries the `is_permanent_user()` guard. Post-apply advisor: `anon_security_definer_function_executable` down to `record_security_event` only (intentional). |
| 025 | `migration-025-rsvp-rating-upsert-race.sql` | yes — applied live (see 2026-09-02 Security entries below). |
| 026 | `migration-026-otp-rate-limit.sql` | **yes — but this row was WRONG until 2026-09-07.** It claimed applied; `consume_otp_limit` did not exist live (confirmed by catalog query, not inference). Consequence: `consumeOtpLimit` failed closed and the PGRST202 fallback only returns true when `NODE_ENV !== "production"`, so **both** `requestEmailCode` and `verifyEmailCode` refused before ever reaching GoTrue on a production deploy. That is why the project has 62 anonymous users and zero permanent accounts ever — sign-up was structurally impossible, not unpopular. Applied and verified by T0 on 2026-09-07. A ledger that is trusted and wrong is worse than no ledger: verify against the catalog, not against this table. |
| 027 | `migration-027-spots-name-index.sql` | yes — applied live. |
| 028 | `migration-028-friendships-rls-recursion.sql` | yes — applied live. |
| 029 | `migration-029-rls-auto-enable-capture.sql` | yes — applied live. |
| 030 | `migration-030-plan-command-quota.sql` | **yes — applied live 2026-09-04 via Supabase MCP (T0), owner-approved.** Verified: `plan-command` scope present, 20/min·100/day, `anon` cannot execute `consume_app_quota`, `authenticated` can. |
| 031 | `migration-031-schedule-purge-cron.sql` | **yes — applied live 2026-09-04 via Supabase MCP (T0), owner-approved.** Verified: `pg_cron` installed, `purge-security-operational-data` job scheduled at `17 2 * * *`. |
| 032 | `migration-032-fix-votes-legacy-index-drop.sql` | **yes — applied live 2026-09-04 via Supabase MCP (T0), owner-approved.** Verified: `votes_round_choice_unique` confirmed gone from `pg_indexes`; `votes_participant_round_key` confirmed present. Live correctness bug closed. |
| 033 | `migration-033-fix-create-secure-plan-category-check.sql` | **yes — applied live 2026-09-04 via Supabase MCP (T0), owner-approved. CRITICAL.** Fixes `create_secure_plan`'s exact-category-match check, which blocked every real plan creation since migration 020 (2026-08-24) — confirmed live: 0 successful creations through the app in 11 days. Verified via full function definition (not a text-match guess, see the 2026-09-04 note above about a false-positive `LIKE` check against the migration's own comment): the category-equality clause is gone, the per-spot age gate (keyed on each spot's own category) and the ownership/sourcing clause are unchanged, grants correct. |
| 034 | `migration-034-create-direct-plan.sql` | **yes — applied live 2026-09-04 via Supabase MCP (T0), owner-approved.** New `create_direct_plan(jsonb, uuid)` RPC for the "skip the vote" flow — one spot, immediately `decided`, category derived from the spot itself (not client input, same lesson as 033). Verified: function exists, returns `jsonb`, `anon` blocked, `authenticated` allowed. |
| 027 | `migration-027-spots-name-index.sql` | **NO — corrected 2026-09-16.** Earlier ledger/prose said applied; live catalog probe: `spots_name_idx` absent. Deferred (not superseded by 040's trigram index; see runbook). |
| 028 | `migration-028-friendships-rls-recursion.sql` | **Was NOT live (ledger said yes); applied live 2026-09-16 19:23:38Z via Supabase MCP (T1), owner-approved.** Before it, every friendship write failed with 42P17. Verified: both write policies in 028 form. |
| 039 | `migration-039-first-curated-photos.sql` | **YES — corrected 2026-09-16.** Recorded as held; live has all 6 `photo_url`s and all 6 files in `spot-photos` (sample served 200 image/jpeg). |
| 047 | `migration-047-delete-plan.sql` | **yes — applied live 2026-09-16 19:24:05Z via Supabase MCP (T1), owner-approved.** Verified: exists, anon cannot execute, authenticated can. |
| 048 | `migration-048-friendship-consent.sql` | **yes — applied live 2026-09-16 19:24:48Z via Supabase MCP (T1), owner-approved, after 028.** Verified: insert policy gone, authenticated table INSERT revoked, live PostgREST insert → 42501, 3 invite RPCs anon-refused, `friend_invites` RLS on with 0 policies. |
| 050 | `migration-050-owner-reads-without-uid.sql` | **yes — applied live 2026-09-16 19:25:37Z via Supabase MCP (T1), owner-approved.** Verified: both RPCs exist (anon refused), `execute_plan_command` return drops uid, old client's signed-out reads 200 with data, plans/spots/votes/rsvps/ratings read policies unchanged. |
| 049 / 051 | column-grant migrations | **NOT applied — not approved.** Wait for the Vercel deploy + runbook step 4 gate. |

`npm run test:smoke` asserts the 019 guards against the live project. All ten
database guards pass as of 2026-08-10: the plans projection carries no host
token, forged host-token and member_ages writes are refused, and every
participant RPC rejects foreign spots, dead rounds, empty names and premature
ratings.

## Archived history

Everything from 2026-08-10 through 2026-09-02 (the v1 build-out, production
hardening, the migration-020 security pass and every wave/lane entry up to
the palette reset) has moved to `worklog-archive.md`. It is history, not live
state — read it only if you are chasing why something was built the way it
was. Live state — 2026-09-04's entries, today's actual work — starts below.
Split again once this passes ~600 lines (`CONTEXT_HYGIENE.md` rule 3).

## Security/Backend — concurrency load testing + a real live bug found — 2026-09-04

T0's ask: authenticated/mutating paths have never been load-tested (only the
unauthenticated front door has a baseline). Built the missing harness rather
than more correctness-only tests — 023/025 already proved the write RPCs
correct under 2-way races; nobody had measured them under real width.

**New tooling** (`scripts/load/`): `mint-voters.mjs` mints real anonymous
Supabase sessions (the actual guest path) against the live project;
`concurrency.mjs` fires N of them at `cast_plan_vote`/`set_plan_rsvp`
simultaneously via PostgREST's RPC endpoint directly (there's no Next.js
route in front of these — the browser calls `supabase.rpc(...)` straight from
the client, so `run.mjs`/autocannon can't reach them and wasn't the right
tool). Runs against a new dedicated fixture plan
(`supabase/seed-load-test-plan.sql`, id `33333333-…`), kept separate from the
e2e suite's shared `22222222-…` plan on purpose.

**Results at n=15** (GoTrue's anonymous-signup rate limit — see below — was
the real ceiling on scale this session, even after the owner raised the
dashboard limit): `vote-contend`, `vote-flap`, `rsvp-contend` all clean, 0
errors, p99 under 1.1s. `rsvp-collide` (15 first-time RSVPs racing the same
display name — the scenario built specifically to stress `set_plan_rsvp`'s
unbounded retry-on-`unique_violation` loop from migration 025, never tested
past 2-way before) resolved to exactly 1 winner + 14 clean rejections, p99
462ms, no timeout, no raw error leaked. **No fix needed** — the loop degrades
gracefully at this width. Full numbers: `scripts/load/README.md`.

**A real live bug, found by the testing, not the goal of it:** the first
`vote-contend` run (an unrealistic test shape — same `voter_name` for all 15)
failed 14/15 on a raw `23505 duplicate key value violates unique constraint
"votes_round_choice_unique"`. Traced it to a genuine live bug in **migration
023** (applied live 2026-09-01): its step "2b" tries to drop this legacy
index by searching `pg_constraint`, but `votes_round_choice_unique` was
created by migration 009 as a bare `create unique index`, never wrapped in a
table constraint — so the lookup silently finds nothing, the DO block exits
clean, and the migration looks like it succeeded. **Confirmed live** via
direct catalog probe: `pg_indexes` still lists it on `votes` today. 023's own
verification block has the identical blind spot (it only re-checks
`pg_constraint` too), which is why this went unnoticed since 2026-09-01.

Live consequence today: two guests who type the same display name and vote
the same spot/round hit an unhandled error instead of both votes recording
under their own identity — the exact failure mode 023's own comment predicted
if its drop ever failed. **Migration 032** fixes it (`drop index if exists
votes_round_choice_unique` by its now-known exact name). `security`-reviewed:
safe — no FK, RLS policy, or trigger depends on it; `schema.sql` never
defined it in the first place (a fresh rebuild was never exposed to this
bug); no null-hash write path exists live to worry about once it's gone
(every version of `cast_plan_vote` since migration 018 has rejected a
missing/malformed hash before any insert, and direct table writes are
revoked from `anon`/`authenticated` regardless).

**Also found and staged, all `security`-reviewed, none applied:**
- **Migration 030** — `execute_plan_command` was the only `app/api/**` route
  with zero rate limiting. Own quota bucket, 20/min · 100/day. Review caught
  a real gap in my first pass: the route didn't reject anonymous sessions, so
  the new per-uid quota's key was mintable at will — fixed, matches
  `/api/plans` and `/api/spots/deal`'s existing `is_anonymous` check.
- **Migration 031** — `purge_security_operational_data()` has existed since
  020 but was never actually scheduled (`SECURITY_SETUP.md` documents a
  manual dashboard step that was apparently never done; `pg_cron` isn't even
  installed on the project yet). Schedules it via `cron.schedule`.
- `schema.sql` was missing `plans_creator_idx` (migration 014 created it live
  in 2026-08-09; schema.sql never got the mirror) — fixed, no migration
  needed, 014 is already live.
- `smart-search`'s missing-age default failed *open* to 21 where
  `spots/deal`'s identical condition fails *closed* to `MIN_ACCOUNT_AGE` —
  aligned the two.

**Finding, not fixed:** GoTrue's anonymous-signup rate limit is strict enough
that minting even 20 test voters took most of a session, drained by the
mint-voters script's own bursts. Real-world equivalent: several guests on the
same wifi opening a share link within the same window could be throttled out
of getting a session at all. The owner raised the dashboard limit once for
this test; whether the default needs to stay raised for real group use is
still open.

**Deferred, stated plainly:** load-testing `/api/plans` (create) and
`/api/spots/deal` needs a real permanent (non-anonymous) session, and this
app has no password auth and no service-role key by design — not self-serve
the way anonymous voter sessions are. Needs the owner to hand a real
permanent session's refresh token to the load script, or to accept it stays
unmeasured.

**030, 031, 032 are staged only** — none applied to the live project.
@T0 — same shape as 025–029: ready for the owner to review and apply, ideally
032 first given it's a correctness bug already live, not just hardening.

## Venue-link enrichment — steps 2–6 of the pipeline, buildable-now slice — 2026-09-04

Owner-named top priority (per `AGENT_COORDINATION.md`'s priority reset).
`PLACE_IMPORT_ARCHITECTURE.md` (2026-08-07) already speced the 7-step
pipeline; step 1 (intake/persistence) turned out to already be built despite
the doc's stale claim otherwise — `app/api/place-import/route.ts` already
wrote real `place_imports`/`place_collections`/`place_collection_items` rows.
What was actually missing: nothing ever fetched the source, extracted clues,
matched against the catalog, or moved a row past `status: 'pending'`. Built
that — no schema change needed, migration 012's columns already supported it.

**New: `lib/place-import/`** (was a single file, now a directory):
- `safe-fetch.ts` + `ip-guard.ts` — the SSRF-hardened fetch primitive. DNS-
  resolves before connecting, rejects private/loopback/link-local/cloud-
  metadata/CGNAT/multicast/reserved ranges (both IPv4 and IPv6, including
  unwrapped `::ffff:`-mapped addresses), re-validates every redirect hop the
  same way (max 2), 5s timeout, 512KB streamed-and-capped response,
  content-type allowlist. `ip-guard.ts` is deliberately dependency-free (no
  `server-only`) so its pure logic is directly unit-testable.
- `oembed.ts` — TikTok/YouTube/Reddit adapters against each provider's fixed,
  public, unauthenticated oEmbed host. Instagram/Facebook go straight to
  `needs_input` — their oEmbed/Graph APIs have required an approved app +
  access token since ~2018–2020 and no credentials for either exist in this
  project; honest, not silently broken.
- `web-adapter.ts` — generic OG-tag extraction for arbitrary "web" links,
  through the same `safe-fetch.ts` hardening. This is a deliberate, reviewed
  exception to the architecture doc's "never fetch an arbitrary URL" line —
  the doc's security section now says so explicitly, so it stops
  contradicting the code.
- `match.ts` — catalog-only candidate matching (token overlap against
  `spots where source = 'curated'`, ~100 rows, no AI, no new Postgres
  extension — `pg_trgm` isn't installed and isn't needed at this size).
- `resolve.ts` — orchestrates the above into `resolved` / `needs_input`
  (ambiguous-with-candidates, or no-clues/no-match/fetch-failed/unsupported)
  / `failed`. Runs **synchronously** inside `POST /api/place-import`,
  deliberately — no background-job infra exists in this app yet and every
  call is bounded (5s/512KB), so the upgrade path is "move behind a job once
  that's a real complaint," not before.
- `route.ts` also fixed: was an `upsert` that reset `status` to `'pending'`
  on every re-save of an already-resolved link (forcing a pointless re-fetch
  every time someone added the same place to a second collection) — now
  fetch-then-insert, with a `23505` fallback for the two-concurrent-first-
  saves race (re-selects the winner's row instead of surfacing a spurious
  error). GET now returns the resolved spot's real name/area/category/photo/
  lat-long + a plain Google Maps deep link (no API key — the free-tier "how
  to get there"), and the candidate list when ambiguous.

**Verified live against the real project, not mocked:** a real YouTube
oEmbed call returned real title/author/thumbnail; a real fetch of
wikipedia.org extracted real OG tags; `http://127.0.0.1:1/` was correctly
rejected by the SSRF guard; matching scored a real spot's own name back at
itself with score 1.0 against the real 82-row curated catalog. Full
persistence-path verification (the final `place_imports` write) needs a
permanent account, same blocker already on record for load-testing
`/api/plans`/`/api/spots/deal` — `people`/`place_imports` RLS requires
`is_permanent_user()` even for a self-insert, so an anonymous session can't
own a row here either. Not fixed/worked around; noting it's the same
environmental gap, not a new one.

**`security` review** (full transcript in the session, not reproduced here):
diff is clean overall. Two real items acted on: `isPrivateAddress` was
missing CGNAT (`100.64.0.0/10` — a real reachable target on some hosting
platforms, not theoretical) plus several low-value-but-cheap ranges
(IPv4 multicast/reserved/broadcast, IPv6 multicast/deprecated-site-local/
unspecified `::`) — added, with test coverage. The architecture doc's
"never fetch an arbitrary URL" line directly contradicted the new `web`
adapter — resolved by updating the doc to state the exception and its
hardening explicitly, not by weakening the code. One item flagged and
deliberately not fixed: concurrent first-time saves of the same brand-new
link can trigger two redundant (not harmful — idempotent, quota-bounded)
resolution passes; ponytail-lazy call, skipped, no evidence it matters in
practice.

**Explicitly out of scope this pass, unchanged from the plan:** Instagram/
Facebook real fetching (needs an approved API, owner-decision-gated);
paid Directions API / paid Places-photo API (both owner-decision-gated,
this ships the free version of each); the result/candidate-picker UI
(Frontend's turf once this contract exists); screenshot-upload fallback.

Gate green (lint/tsc/38 tests/build) throughout. No new migration, no schema
change. Committing to `lane/backend`.

## CRITICAL — core "start a plan" flow has been completely broken since migration 020 — 2026-09-04

Found while scale-testing at real volume (T0's ask: verify the app holds
thousands of concurrent users). Not a load/perf finding — a correctness bug
the scale-testing infrastructure happened to surface immediately, because it
was the first thing in this session to actually call `POST /api/plans` with
real dealt spots and a real permanent session end to end.

**The bug:** `create_secure_plan` (migration 020, applied live 2026-08-24)
requires all 9 submitted spot ids to share the plan's single `category`.
But no curated category has 9 spots — dinner, the largest, has 5 (already
documented in `lib/spots/match.ts`'s own comment) — which is exactly why
`/api/spots/deal` deals from a whole **category family**
(`categoryFamily()`, e.g. dinner's family also includes cafe/brunch/dessert/
shisha), by design. The client submits the plan with the single category
the user picked, but spotIds spanning that family — exactly how deal is
built to work, and exactly what `create_secure_plan`'s exact-match check
then rejects.

**Reproduced live, not synthetically:** copied the real curated catalog
(82 rows, live IDs) into a local mirror. `POST /api/spots/deal
{category:"dinner", count:9}` returned 9 real ids; their actual categories
were `[dinner, cafe, cafe, cafe, cafe, brunch, brunch, dessert, dessert]` —
1 of 9 actually "dinner". `POST /api/plans` with those exact ids then 403'd
every time with "This account cannot create that plan."

**Confirmed against the live database, not assumed:** queried `plans`
directly. **6 plans exist, ever.** 5 were created before 2026-08-24 (pre-020,
before this check existed). Exactly 1 was created after — this session's own
load-test fixture plan, inserted directly via SQL, never through the real
RPC. **Zero successful plan creations through the real app in the 11 days
since migration 020 went live.** No partial workaround slipped through.

**A second bug found investigating the first:** `app/api/plans/route.ts`
and `app/api/spots/deal/route.ts` both validate spot ids with a UUID regex
requiring version nibble 1-5 and variant 8/9/a/b
(`/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`,
introduced 2026-08-20, `3dd972b`). The curated catalog's ids are
deterministic (e.g. `a0000000-0000-0000-0000-000000000001`), not
`gen_random_uuid()` output — every one fails that strict pattern. This
silently filtered `spotIds` to zero before the category bug even had a
chance to fire, and separately broke `/api/spots/deal`'s "been"/exclude-list
filtering (repeats not actually excluded). **Fixed**: loosened both to plain
8-4-4-4-12 hex, matching what Postgres's own `uuid` column type accepts —
the real validation target. Left `command/route.ts`'s identical-looking
regex alone; it validates the plan **path** id, which is a real
`gen_random_uuid()` value, so the strict form is correct there and nothing
demonstrates it's broken.

**Fix: migration 033.** One-clause diff off migration 020's `create_secure_
plan` (`create or replace`, byte-identical otherwise) — drops `and
s.category = category_value`. `security` review (full transcript in
session): confirmed the severity read independently by re-deriving every
category's curated-spot count from the seed/migration files (max is 5, same
conclusion without trusting my live count); confirmed no new hole opened —
the per-spot age gate already keyed off each spot's own `s.category`,
completely independent of the plan's declared category, both before and
after, so cross-category age-gating was never affected; confirmed ownership/
sourcing (`s.source='curated' or created_by_user_id=uid`) untouched. Filed
as **Critical on availability grounds, not a vulnerability** — nothing was
exposed, the fix only removes a false assumption the deal system was never
built to satisfy. Cross-checked history: no prior worklog entry claims a
verified dealt-spot plan creation; `CHECKPOINT.md` documents the original
"nine unique same-category spots" design assumption in writing — the bug's
root cause was in the original spec, not a later regression in the RPC
itself (only the *enforcement* of it was new, in 020).

**Verified live on the local mirror after the fix:** the identical
deal-then-create sequence for "dinner" now returns `200` with a real plan
id and host token.

**Staged, not applied** — migration 033, plus the two UUID-regex fixes in
`app/api/plans/route.ts` and `app/api/spots/deal/route.ts` (application
code, ships whenever this branch is integrated — no live/apply step needed
for those two, only for 033). Flagged to T0 immediately, ahead of the rest
of this session's report, given severity — T0 is getting owner approval to
apply 033 now.

## Load-testing to real scale (thousands of concurrent users) — local Supabase stack — 2026-09-04

T0/owner's ask: verify the app holds **thousands** of concurrent users, not
just the n=15 the first load-test pass reached (capped by GoTrue's live
anonymous-signup rate limit, even after one dashboard raise). Continuing to
fight that limit meant hammering production's real auth service at exactly
the volume `scripts/load/README.md` already warns against.

**Different target, not a bigger rate limit.** Docker + `npx supabase` (CLI
v2.116.0) were both available this session — a full local Postgres/GoTrue/
PostgREST/Realtime stack has **no rate limit**, since it's a local Docker
container. This also closed the *other* gap the first pass hit:
`/api/plans`/`/api/spots/deal` need a **permanent** session, which had no
self-serve path against the live project (no password auth, no service-role
key by design). Locally, the stack's own well-known local `service_role` key
mints permanent test accounts instantly, in bulk — one piece of
infrastructure closed both gaps.

**Setup** (`scripts/load/seed-local-stack.mjs`, `mint-local-users.mjs`,
`scale.mjs`): `npx supabase init && npx supabase start`
(`supabase/config.toml` committed with `[db.seed] enabled = false` — this
repo's own `seed.sql` targets the hand-maintained `schema.sql`, not the
CLI's migrations/ convention, which this project doesn't use). Schema loaded
via `psql -f supabase/schema.sql`, `app_control_secrets` seeded to a known
value. **Copied the real curated catalog from the live project** (82 rows,
real ids — this is exactly what surfaced the category bug above) rather than
reconstructing from seed files. Seeded 50 plans (not one — "thousands of
concurrent users" for this product means many people across many small
plans hitting shared infrastructure, not one plan with thousands of
participants).

**Minted 2,500 real permanent test accounts**, 0 failures on the final run
(an earlier attempt hit local GoTrue resource limits around n≈1,200-2,100
under too-high concurrency; throttling batch size from 30→8 with a small
inter-batch pause fixed it cleanly — noted as a real, if narrow, finding:
local GoTrue under Docker has a concurrency ceiling worth knowing about for
future local-stack work, separate from the live rate limit this was built to
avoid). Each account's `@supabase/ssr` session cookie was derived via the
real library (not hand-reimplemented cookie serialization) — `/api/plans`
and `/api/spots/deal` read auth from cookies, not a bearer header, so a raw
access token alone 401s against this app's own routes (only the direct
PostgREST RPC calls, e.g. for votes, accept a bearer token).

**Scale scenarios built** (`scripts/load/scale.mjs`): `vote-scale`,
`rsvp-scale` (spread across the 50 plans, not one — tests real cross-plan
throughput), `plan-create-scale`, `spot-deal-scale` (both blocked entirely
in the first pass, now real). Smoke-tested clean at n=10 each once the two
bugs above were fixed. Full-scale numbers (n=hundreds-to-thousands) not yet
run this session — the category bug took priority once found, since a
broken core feature matters more than a benchmark number, and the fix
needed verifying before spending the scale run's time on now-stale code.

**Update — done.** Full results (clean to n≈200, real ceilings past that,
explicitly caveated as local-single-instance not production) are in
`scripts/load/README.md`. Local stack stopped after.

## Direct plan — new plan-creation path, skip the vote — 2026-09-04

`design-system/SPECS.md` §10 / `PRIORITIES.md`: a second entry point for
someone who already knows the place and wants to lock it in immediately.
Feasibility already confirmed earlier this session (see the message to T0,
same reasoning here): `create_secure_plan`'s INSERT hardcodes
`status='open', stage='pool', pool_count=3` unconditionally and requires
exactly 9 spot ids — none of that fits a "1 spot, already decided" plan, and
the schema itself needs no change (`pool_count`'s check already allows 1,
`stage`/`status` already allow `'decided'`, `winner_spot_id` is a plain
nullable FK).

**Migration 034**: `create_direct_plan(p_plan jsonb, p_spot_id uuid)` — a
new function parallel to `create_secure_plan`, not a branch inside it
(their invariants are different enough that sharing a body would mean
threading a mode flag through every check). Mirrors `create_secure_plan`'s
permanent-account gate, field-whitelist pattern, and budget/radius/lat-long/
vibe/avoid validation exactly. Deliberate differences:
- **No client-supplied category.** Derived server-side from the picked
  spot's own `s.category` — the same class of bug migration 033 just fixed
  (never trust a client-declared category against real spot data) doesn't
  get a chance to recur here, since there's exactly one spot and its
  category is unambiguous.
- **No deadline requirement.** A directly-decided plan has no vote to
  close, so `deadline` is optional/unvalidated rather than required and
  future-dated.
- `status`/`stage`/`pool_count` hardcoded to `'decided'`/`'decided'`/`1`,
  `winner_spot_id` set at creation, one `plan_spots` row with
  `advanced = true`.

**`app/api/plans/direct/route.ts`** — same house preamble as every mutating
route, reuses the existing `plan-create` quota scope (same cost/risk shape
as the deal-and-vote path, not a new bucket).

**Verified live on the local mirror, real cases, not just the happy path:**
a real minted permanent user creating a plan for a real 18+ "shisha" curated
spot → 200, plan correctly shaped (category derived correctly, `status`/
`stage='decided'`, `pool_count=1`, `winner_spot_id` set, one `plan_spots`
row with `advanced=true`). An underage user against the same 18+ spot → 403.
A nonexistent/inaccessible spot id → 403 "That place is unavailable". No
`spotId` at all → 400. A request smuggling an unrelated extra field → 400
via the whitelist correctly rejecting it.

**`security` review**: safe to commit, no new hole. Confirmed the
ownership/sourcing clause guards nothing worse than `create_secure_plan`
already does; confirmed the server-derived category doesn't reopen 033's bug
class downstream (`plans.category`/`spots.category` are free text with no
CHECK constraint either way, and every consumer — `categoryMeta`,
`categoryGroup` — already has a documented fallback for an unrecognized
category); confirmed by tracing every reader of `plans.deadline` in the
codebase (exactly one, an already-null-safe display formatter, gated behind
`status !== 'open'` for the auto-advance timer — which never fires for a
plan created already `'decided'`) that the unvalidated deadline is genuinely
inert, not just plausibly safe; confirmed quota reuse creates no extra
budget (same counter, not a separate allowance). One non-blocking note
acted on: the field whitelist didn't strip `intelligenceModel` the way the
sibling route does — currently unreachable (nothing calls this route yet)
but a real foot-gun once Frontend wires it against the same shared form
state — fixed.

Gate green (lint/tsc/38 tests/build). Staged migration, needs owner
approval like every migration in this directory. Frontend was blocked on
this exact signature — ready for them now.

## Carpool coordination — RSVP fields — 2026-09-04

`design-system/SPECS.md` §10.2, owner-approved as originally scoped: a
coordination list on the payoff screen, not a matcher — who's driving with
open seats, who needs a ride, who's making their own way. No route
optimization, no rider/driver assignment, no capacity enforcement beyond
what the columns themselves express.

**Migration 035** extends `set_plan_rsvp` directly (two new optional
params, `p_transport`/`p_seats_available`) rather than a new RPC — this is
two more fields on the same one-row-per-`(plan,voter)` record RSVPs already
are, and `rsvps` keeps its existing posture: no direct write policy, this
RPC is still the only way in. New columns: `transport text check (... in
('driving','need_ride','own_way'))`, `seats_available smallint check
(... between 0 and 8)`, plus a cross-column constraint
(`rsvps_seats_only_when_driving`) so a seat count can never exist without
`transport='driving'` — enforced at the DB level, not just documented,
on top of the identical check re-validated inside the function body.

**A real pitfall caught before it shipped, not by review**: `create or
replace function` only replaces a function with an *identical* parameter
signature. Adding two params — even defaulted — would have created a
second, overloaded 7-arg function alongside the old 5-arg one instead of
replacing it (the arity-change sibling of the return-type pitfall migration
023 already hit once). Migration 035 explicitly `drop function if exists
set_plan_rsvp(uuid, text, boolean, text, text)` before creating the new
7-arg version, so there is exactly one `set_plan_rsvp` live, not two.

**Verified live on the local mirror, real cases**: driving+seats succeeds;
need_ride with no seats succeeds; seats supplied without
`transport='driving'` is rejected with the function's own clean error, not
a raw constraint violation; out-of-range seats rejected; an invalid
transport string rejected; omitting both new params entirely still
succeeds (backward compatible); switching an existing driver to
`need_ride` correctly clears the stale seat count rather than leaving it.

**`security` review**: safe to commit. Confirmed all four grant/revoke
lines in `schema.sql` (two historical blocks reflecting this codebase's
anon-grant-then-later-revoke pattern) were updated to the new 7-arg
signature, none left stale. Confirmed the existing ownership gate
(`participant_token_hash` mismatch → `42501`) still runs before both the
insert and update branches, unchanged, so the new columns don't open any
new write path around it. Confirmed `rsvps`' `plan_access`-scoped select
policy is unmodified — every plan member seeing everyone else's carpool
answer is the feature itself, not a new disclosure. Confirmed the
`between 0 and 8` bound is correct at both layers (inclusive boundaries,
non-integer input rejected by smallint coercion before reaching the
function).

**One real, non-security note the review caught, for Frontend**:
`app/plan/[id]/page.tsx`'s `setRsvp()` is the current live call site and
still only passes the original 5 params. Because the update branch
unconditionally sets `transport`/`seats_available` from whatever the call
provides (full replace, same as `coming`/`choice` already work — not a
partial patch), every existing "coming/maybe/no" tap through the
*unmodified* frontend will silently null out any previously-set carpool
answer the moment this migration is live — even before any carpool UI
exists to re-set it. Not a security issue (a caller can only affect their
own row), but a real sequencing trap. **The fix is one line**: `setRsvp`
already holds `mine` (the caller's existing rsvp row) in scope — pass
`p_transport: mine?.transport ?? null, p_seats_available: mine?.seats_available ?? null`
in the existing RPC call so an unrelated status change preserves whatever
carpool answer was already there. Needs landing *before or alongside* 035
going live, not after. Posted as a cross-lane request.

Gate green (lint/tsc/38 tests/build, schema↔types drift check clean).
Staged migration, needs owner approval like every migration here.

## Production-readiness checklist pass — 2026-09-04

Owner away, migrations can't be approved; T0 kept the lane moving on
code-level items from `PRODUCTION_CHECKLISTS.md`'s "Genuinely open" list.
Five items, three closed with verified evidence and no code change, two
small/subtractive diffs — matching the owner's later standing instruction
(relayed by T0) against over-engineering: ship the smallest thing that
actually answers the question, "already sufficient" is a valid close.

- **CORS** — verified, not fixed: grepped every route + `next.config.ts`,
  no `Access-Control-Allow-*` header anywhere. That's Next's secure
  default (no CORS headers = browser enforces same-origin). Confirmed
  **live**: a GET, a POST, and an `OPTIONS` preflight, all with a foreign
  `Origin`, came back with zero CORS headers — a real browser's preflight
  fails and the cross-origin request never sends. Documented in
  `next.config.ts` so a permissive header doesn't get added later without
  someone knowing what it opens.
- **Cookie flags** — verified, not fixed: `SameSite`/`Secure` already
  correct in both `lib/supabase/server.ts` and `lib/supabase/client.ts`.
  `HttpOnly` is deliberately absent — checked `@supabase/ssr`'s own source
  (never touches `httpOnly`), and the browser client reads/writes the
  *same* cookie to manage its session, so `httpOnly` would break sign-in,
  not secure it further. The compensating control is the CSP already in
  place. Documented in both files against a future "fix" that breaks auth.
- **Trim `select("*")`** — `lib/place-import/resolve.ts` (own file)
  narrowed to exactly what `match.ts` reads, with an honest
  `CuratedSpotRow` type (`Pick<Spot,...>`) instead of overclaiming the
  full shape. `app/plan/[id]/page.tsx`'s spot fetch and `app/home/
  page.tsx`'s `spots` read (the one migration 022's comment named) both
  traced field-by-field against `OptionCard`/`DecidedPlan`/`AccountViews`
  before trimming — `created_by_user_id` had no reason reaching every
  shared-link voter. Left component prop *types* as `Spot` (not narrowed)
  since `OptionCard`/`DecidedPlan` are consumed from more than one place
  now (`DirectPlanForm.tsx` too) — re-typing those is Frontend's call, not
  a side effect of trimming a query; each trimmed select has a comment
  naming exactly what's safe to read back. `votes`/`rsvps`/`ratings`/
  `plan_spots` reads left alone — small tables, not worth the diff.
- **`npm audit` CI gate** — one line in `ci.yml`'s `quality` job,
  `--omit=dev --audit-level=high` (matches this repo's own stated
  tolerance; `high` avoids flapping on dev-only-transitive noise). 0
  vulnerabilities today.
- **Account lockout equivalent** — wrote up the real math instead of
  waving it through: OTP-verify's day-cap (20/day, migration 026)
  dominates regardless of the exact OTP TTL (`SECURITY_SETUP.md`'s "10
  minutes or less") — at 8/min, an attacker hits the day-cap in under 3
  minutes, so no matter how many codes get issued in a day, they never get
  more than 20 total guesses against a 6-digit code. ~0.002%/day.

All five documented in `PRODUCTION_CHECKLISTS.md` directly (moved out of
"genuinely open" with the reasoning inline, not just a checkmark).

**Also drafted** (Design's cross-lane request, §15.3): `migration-036-
moodboards.sql` — `moodboards`/`moodboard_items`, mirroring
`visit_collections`/`visit_collection_items` byte-for-byte (owner-scoped
RLS, same free-form-collection shape). One deliberate deviation from
`lib/planning.ts`'s demo shape: `storage_path` instead of an inline base64
`imageDataUrl`, matching `visit_photos`' real-image pattern. No RPC, no
route, no auto-creation trigger, no friends/shared read policy — Design's
spec only asked for owner CRUD, so that's all this builds (confirmed the
later addition is purely additive, no schema change needed).

**Verified live on a local mirror, real cross-user cases**: owner creates
a board + item; a second user gets an empty read, a 403 attaching an item
to the owner's board, a 403 creating a board under the owner's
`person_id`; invalid `kind`/`visibility` hit the CHECK constraints; a
case-insensitive duplicate name hits the unique index.

**`security` review**: safe, no widened access. Confirmed the items
policy's `WITH CHECK` correctly has no second join to pair against
(unlike `visit_collection_items`, a moodboard item has no owned-row FK to
protect — "this board is mine" is the complete condition). Confirmed
`visibility`'s `'friends'`/`'shared'` values are genuinely inert today
(no policy references them, not in `supabase_realtime`), not just assumed
inert. One consistency fix taken from review: `schema.sql`'s explicit
table-drop list now lists both new tables (cascade via `people` already
covered it, but every other people-owned table is listed explicitly).

Two commits: `659d250` (checklist items), `d11d83a` (moodboards, staged,
not applied — needs owner approval like every migration here). Gate green
throughout (lint/tsc/38 tests/build, schema↔types drift clean).

---

## 2026-09-07 — T1 Security/Backend: guest-vote made safe, and 4 of 12 coordinates

**guest-vote.spec.ts no longer touches the live project.** It voted on a
hardcoded live plan on every run, which is why RUN_E2E stayed off and the
cross-browser matrix never ran on delivery item #1.

The obvious fix — a per-run plan, torn down after — is **impossible against
live**: `plans` and `votes` have no delete policy at all (read-only to
clients; writes go through security-definer RPCs) and there is no
service-role key, so nothing in this project can remove a plan or a vote
once created. Per-run fixtures would have leaked rows into production
permanently. The local stack is the only place teardown is real, so
`global-setup.ts` provisions a disposable plan there and `global-teardown.ts`
deletes it. **Setup refuses any non-loopback URL**, so a misconfigured CI
cannot point five browsers at production and start voting. The voter
assertion is now exact (0 → 1) rather than "at least one", which was only
hedging against shared data.

Two mismatches between local and production, both found by running it:

- **`enable_anonymous_sign_ins` was false locally** while live has it on. The
  guest path *is* an anonymous session, so the local stack could not run it
  at all — and did so silently. Local config that does not mirror production
  makes a green suite meaningless.
- The production build gates guests behind Turnstile (`NODE_ENV ===
  "production"` in `bootstrapPlanAccess`). Rather than bypass it, the run
  uses Cloudflare's published always-pass test key, so the real gate is
  exercised instead of skipped.

**chromium, firefox and Mobile Chrome pass. webkit and Mobile Safari cannot
run a production build over plain http — and it is not a product bug.**
`Strict-Transport-Security` plus the CSP's `upgrade-insecure-requests` make
WebKit rewrite every asset to `https://localhost:3010` and fail with an SSL
error; Chromium and Firefox exempt localhost from HSTS, WebKit does not.
Confirmed from WebKit's own `requestfailed` events, and by curling both
headers off the running server. In production everything is https and the
upgrade is a no-op. Those two projects need https or a deployed preview —
**the headers are correct and must not be relaxed to make a test pass.**

**Coordinates: 4 of 12, and the other 8 stay null.** These venues are largely
absent from OpenStreetMap, so where the venue was missing the query targeted
the landmark containing it, hand-checked. DRIFT Beach via One&Only Royal
Mirage, Twiggy via Park Hyatt Dubai, Padel Pro via One Central at DWTC,
Talise Spa via Madinat Jumeirah. These are **landmark-level, not door-level**
— within a few hundred metres, which is materially correct for a distance
line and a Maps link, and each row's comment records which landmark it came
from so it is not later mistaken for a survey point.

Two of the eight returned something worse than nothing, which is why they are
rejected rather than "not found": **"Bab Al Shams" matched a laundry in
Sharjah**, a different emirate ~60km away — the textbook false positive that
got the loose-query fallback abandoned in 037. And Anantara World Islands'
only available coordinate is Wikipedia's centroid for The World archipelago,
which is kilometres of open water from the resort's island. A coordinate that
looks plausible and is kilometres wrong is worse than null: null hides a
line, wrong sends someone to sea.

The eight want a hand-pasted coordinate from someone who knows the venues.
Free geocoding is genuinely exhausted here.

Migration 042 staged. Verified live that all four ids exist and are still
null. Gate green, 64 tests.

---

## 2026-09-07 — T1 Security/Backend: two criticals from the security audit

**ReDoS in `metaContent` — a whole-process outage from one pasted link.**
The pattern used two unanchored `[^>]+` runs separated by literal anchors, so
markup with many `property="og:title"` occurrences and no following
`content=` backtracked super-linearly: 30KB → 3.9s, 45KB → 13.7s, 536KB →
never returned. safe-fetch's 512KB cap is the input size that makes it
*worst*, not a mitigation; its AbortController is already cleared before this
runs; and `resolvePlaceImport` is awaited inside the route handler, so the
spin is synchronous on Node's single event loop. Not a slow request — every
route for every user stops. At 20 imports/minute, one user is an indefinite
outage.

Fixed with both changes, each load-bearing: scan only the first 16KB (og:
tags live in `<head>`, which this module's own comment already said while the
code read the whole body), and bound the attribute runs to `[^>]{0,200}?` so
no super-linear path survives for a longer input. Regression test asserts a
512KB adversarial document returns in under 50ms. Verified separately that
this does not break real pages: Wikipedia's `og:title` sits at byte 7,904,
well inside the window.

**`participant_token_hash` was a bearer token every co-member could read.**
The RPCs checked only that it was 64 hex characters, never that it belonged
to the caller, and `read accessible votes` returns the whole row — hash
included — to every member. Hashing bought nothing: the server compared a
submitted hash against a stored hash the submitter could read. Pass-the-hash.

The chain needs only the public anon key and a forwarded link: anonymous
sign-in → `claim_plan_access` → `select *` from votes to read every member's
hash → `cast_plan_vote` with the victim's hash. The unique key makes it DO
UPDATE, so the vote *moves*; `p_value := false` deletes it. No app route is
involved, so the CSRF and Origin checks are not in the path, and Realtime
then pushes the rewritten row to the victim's screen. Anyone the link is
forwarded to could decide where the group eats.

**Migration 043** adds `user_id` to votes/rsvps/ratings, written from
`auth.uid()` — the one value in the exchange the caller cannot choose — and
refuses any write whose target row is already owned by someone else. The
delete branch re-checks ownership too, so it does not become the soft spot.
**Reproduced the full attack against the local stack and confirmed each step
now fails**: rewrite blocked 42501, delete blocked 42501, the victim's vote
intact and bound to their uid, and the victim can still change their own mind.

Deliberately deferred: moving the unique key to `(plan_id, user_id, phase,
pool_number)`. That is the complete fix — it would also stop one user voting
under several self-minted hashes — but it means rewriting `ON CONFLICT` and
backfilling a column that *cannot* be backfilled, since existing rows record
only a hash and the user who cast them is unrecoverable. Doing that under
time pressure on live data is how a fix becomes an outage. Legacy rows keep
`user_id is null` and are claimable by the first writer presenting their
hash — a narrow, stated residue.

**Also fixed:** `safeFetch` computed its remaining budget *before* the DNS
lookup, so the lookup went uncharged and the real worst case was ~25% over
the advertised bound. Third appearance of this drift in one function; the
rule now written down is that every wait belongs to the budget. And
`schema.sql` granted the three write RPCs to `anon` and revoked it 180 lines
later — live was always correct, but the file that is meant to *mirror* live
answered "can anon write?" wrongly to anyone grepping it.

**Ledger corrected:** the 026 row claimed applied; it was not, and
`consume_otp_limit` did not exist live. `consumeOtpLimit` failed closed and
its PGRST202 fallback only returns true off-production, so both
`requestEmailCode` and `verifyEmailCode` refused before reaching GoTrue. That
is why this project has 62 anonymous users and zero permanent accounts —
sign-up was structurally impossible, not unpopular. T0 applied it. A ledger
that is trusted and wrong is worse than no ledger.

Journey 119/120 (the remaining failure is the known coordinate gap), 67 unit
tests, gate green. 043 staged.

---

## 2026-09-07 — T0: 026, 042 and 043 applied live

**026 — production sign-in was dead, and the ledger was the bug.**
`consume_otp_limit` did **not exist** in the live database. Confirmed by
catalog query, not inferred. `worklog.md:44` claimed 026 was applied; it was
not, and everything downstream trusted that row.

The consequence explains the thing this project has been staring at all
week. `consumeOtpLimit` fails closed, and the `PGRST202` fallback returns
true only when `NODE_ENV !== "production"` — so it works locally and returns
`false` in production, meaning **both** `requestEmailCode` and
`verifyEmailCode` refuse before ever calling GoTrue. **62 anonymous users
and zero permanent accounts, ever, was not lack of interest — signing up was
structurally impossible.** Every person who tried met "Too many codes
requested for this address" on their first attempt.

The documented OTP brute-force control was also simply not running.
Fail-closed behaviour deliberately unchanged: failing open here would trade
a total outage for unlimited guessing against any email address.

**042 — 4 of 12 zero-coverage coordinates.** beach_club 2/3, padel 1/3,
wellness 1/3; escape still 0/3. Landmark-level, hand-checked, each row
naming its landmark. Eight stay null and want a human who knows the venues —
"Bab Al Shams" matched a laundry in Sharjah, 60km away and a different
emirate, and Anantara World Islands' only free coordinate is open water.

**043 — the pass-the-hash hole.** `participant_token_hash` was a bearer
token stored in a column every co-member could read, and `cast_plan_vote`
validated only that it was 64 hex characters. Anyone with the share link
could read every member's hash and rewrite or delete their vote — none of it
through an app route, so CSRF/Origin never applied, and Realtime then pushed
the rewritten row to the victim's own screen.

Now bound to `auth.uid()` on all three write RPCs, with an ownership check.
Verified live: 3 `user_id` columns, 3 indexes, all 3 functions carry both
`auth.uid()` and the ownership guard, `anon` still cannot execute.

**Deliberate deferral, stated rather than buried:** the unique key was NOT
moved to `(plan_id, user_id, phase, pool_number)`. That is the complete fix
and would also stop one user voting under several self-minted hashes, but it
needs a backfill of a column that **cannot** be backfilled — existing rows
record only a hash, and who cast them is unrecoverable. Legacy rows keep
`user_id is null` and are claimable by the first writer presenting that
hash. Narrow, and its own reviewed step.

### The pattern worth keeping

Three of today's worst findings were not wrong code — they were **records
that disagreed with reality**: a ledger claiming 026 was applied, a CSP
header naming a database the server was not using, and a migration whose
photo URLs named objects that did not exist. Each looked correct and each
produced a confident wrong conclusion downstream. Verify against the live
object, not the document describing it.

---

## 2026-09-07 — T1 Security/Backend: curated_categories (migration 044)

The Discover filter tabs were derived from whatever the 120-row catalogue
read returned, so **a category whose venues all sort late gets no tab at all
and becomes unreachable**. Reproduced rather than argued: padded past 120
rows, added one curated venue named "zzz Late Venue" in a late-sorting
category, and the 120-row read yields no tab for it while the view does.

A view rather than a security-definer RPC, deliberately. A definer function
would have to re-implement 041's "curated spots this caller may see", and a
second copy of a security rule is a second thing to drift — which is exactly
what caused several of this week's bugs. `security_invoker = true` (PG15+;
both local and live are 17.6, checked not assumed) runs the view with the
CALLER's privileges, so RLS on `spots` applies to it exactly as to a direct
read and the view follows 041 automatically if it ever changes.

**That option is load-bearing, not decoration.** Without it a view runs as
its OWNER and bypasses RLS, which would leak the categories of every private
custom spot in the table. Verified both halves: anon sees all 23 curated
categories, and a private custom spot's category does **not** appear.

Also added `notify pgrst, 'reload schema'` to the migration — PostgREST
caches the schema, so a new view returns "Could not find the table in the
schema cache" until it reloads, which reads like the migration failed when
it did not.

Frontend's two findings recorded rather than re-solved: the comma/PostgREST
`or`-grammar bug is the **third** silent-empty-instead-of-error this week and
is now in the property list above; and the Discover grid's missing age gate
(now closed by Frontend, predicate byte-identical to the two existing ones
and sourced from `current_member_age()` server-side) is worth knowing had
existed on a browse surface.

Migration 044 staged. Gate green, 69 tests.

---

## 2026-09-07 — T0: migration 044 applied live

`curated_categories` view is live. Verified as an **anonymous caller over
REST**, not just by privileged SQL: 23 categories returned, `reloptions`
confirms `{security_invoker=true}`, `anon` has select, and every category in
the result is a curated one.

Backend's choice of a **view over a definer RPC** is the right shape and the
reason generalises: a definer function would have to *re-implement* 041's
"curated spots this caller may see", and a second copy of a security rule is
a second thing to drift. `security_invoker = true` runs the view with the
caller's privileges, so `spots`' RLS applies exactly as on a direct read and
the view follows 041 automatically if it ever changes.

**That option is load-bearing.** Without it a view runs as its owner and
bypasses RLS, which would have leaked the categories of every private custom
spot. Both halves verified.

Operational note worth keeping: the migration carries `notify pgrst, 'reload
schema'` because PostgREST caches the schema, and a newly created view
returns "Could not find the table in the schema cache" until it reloads —
which reads exactly like the migration failed when it did not. Confirmed the
cache had reloaded by reading the view over REST rather than trusting the
`notify`.

### Silent-failure property list, now three instances

Recording that the comma bug is the sharpest of the three: the 1000-row cap
and the anon-read both returned an empty **success**, while an unquoted
search term containing a comma returns a genuine **400** that the client
discards — so a rejected request wears the same face as an honest miss.
Someone searching "beach, dubai" reads "no such place".

---

## 2026-09-07 — T1 Security/Backend: Realtime, and a wrong diagnosis I caught

**The reported symptom was broader than the real defect, and my first
diagnosis was wrong in the other direction. Both are worth recording.**

Checked the three candidates: the Realtime container is up and healthy, the
publication holds all five tables, and the `realtime.messages` presence
policies exist locally. All three fine. So I measured instead of inspecting.

**A standalone probe reported that Realtime delivered nothing.** I nearly
shipped a migration justified by "Realtime has never worked in production".
The probe was wrong, not the app: it called `realtime.setAuth()` before
joining and the real client does not. Driving two actual browser contexts
through the real app showed INSERTs propagating perfectly — B's count went
0 → 1 with a visible refetch — under the very configuration I had just
declared broken. **A claim that a two-minute test disproves is worse than no
claim**, and the only reason it did not ship is that the numbers disagreed
with each other and I went with the app over my probe.

**The real defect is narrower and still worth fixing: DELETEs do not
propagate.** A DELETE's WAL record carries only the old row's replica
identity, so under `default` that is the primary key alone — not enough for
Realtime to evaluate the subscription's filter or the row's RLS, so it drops
the event silently while the subscriber stays SUBSCRIBED.

That is not an edge case in this product. `cast_plan_vote` with
`p_value := false` DELETEs the row, which is exactly how someone clears a
pick or changes their mind mid-round. So **someone un-votes and everyone
else's screen keeps showing the old count until they reload** — during a
live group vote, the tally other people are reading is wrong, which is the
one number this app exists to get right.

| votes replica identity | A votes → B | A un-votes → B |
|---|---|---|
| `default` | 1 ✓ | still 1 ✗ |
| `full` | 1 ✓ | 0 ✓ |

One `alter table` between the runs. Live has `default(pk)` on all five
published tables, so this is a production defect. Migration 045 staged.

**Presence works** — A sees Ben, B sees Ana. So does the whole local
Realtime path. The original "nothing arrives, no presence row" measurement
does not reproduce; most likely it predates the `enable_anonymous_sign_ins`
fix and the stack rebuild, since without an anonymous session neither client
ever became a plan member.

**`tests/e2e/realtime-multi-client.spec.ts`** asserts a second client sees
the first client's vote *and its withdrawal*, in two separate browser
contexts. The INSERT half alone passes with or without 045 — the same false
comfort as the single-client spec — so the DELETE assertion is the one
carrying the weight. Verified it fails without 045 and passes with it, with
a message naming the cause.

Gate green, 69 tests on this lane.

---

## 2026-09-07 — T0: migration 045 applied live (Realtime DELETE propagation)

All five published tables now `replica identity full`; verified live, and all
five confirmed still in the `supabase_realtime` publication.

**This was a production defect, not a local one.** A DELETE's WAL record
carries only the old row's replica identity, so under `default` that is the
primary key alone — not enough for Realtime to evaluate the subscription
filter or RLS, so it **drops the event silently while the client stays
SUBSCRIBED.**

Not an edge case: `cast_plan_vote` with `p_value:false` DELETEs the row, and
that is how someone clears a pick. **Someone un-votes and every other
participant keeps seeing the old count until they reload** — during a live
round, the tally other people are reading is wrong.

| | A votes → B | A un-votes → B |
|---|---|---|
| `default` | 1 ✓ | still 1 ✗ |
| `full` | 1 ✓ | 0 ✓ |

Cost is negligible at this scale: `full` writes the whole old row to WAL on
every UPDATE/DELETE, and these tables are 40-136 kB. Worth revisiting only
if any of them reaches millions of rows.

### Two corrections to what was reported, both worth keeping

**Local Realtime was never broken.** Container healthy, publication
complete, presence policies present; two real browser contexts propagate
INSERTs and presence both ways. The earlier "nothing arrives, no presence
row" almost certainly predates the `enable_anonymous_sign_ins` fix — without
an anonymous session neither client becomes a plan member, which produces
exactly that symptom.

**A migration was nearly justified by a false claim.** A standalone probe
reported zero events and the conclusion drawn from it was "Realtime has
never worked in production". The probe was wrong, not the app — it called
`realtime.setAuth()` before joining, which the real client does not. It was
caught only because the probe and the app disagreed and the app was trusted
over the instrument. **The wrong version was the more dramatic one and would
have been believed.**

That is the second time today a plausible moral was drawn from an
undiagnosed symptom and started to spread before anyone read the code path.
The first was mine, about the vote screen reporting a wrong cause.

**And the first version of the multi-client E2E spec was vacuous.** It
asserted only that B sees A's vote, which passed with AND without 045 — the
same false comfort as the single-client spec, one layer up. The **DELETE**
assertion is the load-bearing one, verified to fail without 045 and pass
with it.

---

## 2026-09-07 — T2 Frontend: a failed votes read rendered as an unvoted plan

Fifth instance of this repo's dominant shape, and the most consequential,
because the screen stays **fully usable** while being wrong.

Each of the vote screen's four reads was blocked in turn:

```
plan_spots blocked  -> "This plan wouldn't open"    correct
spots blocked       -> "This plan wouldn't open"    correct
rsvps / ratings     -> plan usable, no false claim  correct
votes blocked       -> "0 people voting", 3 cards, 0 yes each, NO error
```

A plan with **nine voters** rendered as a healthy live vote at zero — no
leader, gravity at full scatter, no retry offered. A guest would vote
believing they were first. On a group-decision app the tally is the entire
content of that screen.

Cause is one line and defensible in isolation: `refetchVotes` discarded its
error and no-opped on null, which is RIGHT for a refetch — a dropped poll
should not wipe a working screen. But `votes` starts as `[]`, so on the
FIRST read a failure is indistinguishable from an empty plan. The same file
already stated the correct principle four lines above, for spots ("never
render a broken, cardless stage"); it simply had not been extended.

Fixed: the first read is load-critical, later refetches keep last-good
behaviour. Both verified — blocked from the start gives the honest error and
a retry; blocked after a good load leaves the screen working and still
showing nine.

### The rule, in its sharpest form yet

**A discarded error is only dangerous when the empty value is a plausible
reading of the world.** `[]` votes means "nobody voted", which happens. `[]`
spots means "a plan with no places", which does not — and is therefore
caught by its own impossibility.

That test says *which* discarded-error sites matter, instead of "check every
error". The remaining sites were swept on that basis: the rest are either
already guarded or their empty state is impossible.

**And fixing the pattern everywhere would have been wrong.** A blocked
ratings read drops its "5.0 / 5 · 2 rated" summary entirely rather than
claiming zero — honest degradation, deliberately left non-critical. Reads
differ in whether their absence can be mistaken for content.

---

## 2026-09-07 — T1 Security/Backend: the module-level client is gone

`lib/supabase.ts` exported `const supabase = createClient()` — a browser
client built at MODULE LOAD, which threw without `NEXT_PUBLIC_SUPABASE_*`.
Importing that file, or anything importing it, was therefore impossible in a
unit test. Since `lib/social.ts` imports it, **the entire signed-in data
layer — visits, friends, collections, photos — was structurally untestable**,
while `place-import` and `spots-match` are well covered simply because they
construct no client. Coverage that looked like neglect was a module-level
side effect quietly setting the testability boundary.

Now `getSupabase()`, memoised. Importing the module constructs nothing.

**Checked the risk before assuming it was mechanical**, since T0 flagged
SSR/client boundaries as the plausible trap: all five direct consumers are
`"use client"` components, none of them touch the client at module scope, and
`createBrowserClient` is itself a browser singleton — so laziness costs no
extra client and identity stays stable for hook dependency arrays. The memo
mostly matters off-browser.

**The unlock is demonstrated, not asserted.**
`tests/social-read-failure.test.ts` previously needed
`process.env.NEXT_PUBLIC_* ??= ...` followed by a dynamic import, purely to
get the module graph to resolve. It is now a plain static import with no env
at all, and the file says so — if that dance ever comes back, a module-level
client has been reintroduced.

Verified against a baseline rather than trusting the diff: stashed the change,
re-ran, and confirmed the two `/login` runtime-health failures are
**pre-existing** and identical with and without it. Both Realtime E2E specs
and guest-vote pass either way. 111 unit tests, journey 119/120 (the known
coordinate gap), lint and typecheck clean.

**Not fixed, flagged:** `/login` fails `runtime-health.spec.ts` with
`page.goto` timing out — it never reaches load. It reproduces without any of
my changes. The likely cause is the Turnstile widget on that page never
settling in a headless context, which would make it a test-environment
artefact rather than a product bug, but I did not confirm that and it should
not be assumed. It is the only page in the suite that behaves this way.

---

## 2026-09-07 — AI: eval suite + hermetic guardrail tests for smart-search

**The B3 blocker record is wrong and has been for a while.** "OpenAI credits
exhausted" is not what is happening. Calls to `gpt-5.6-luna` succeed. The
account is on a free tier with **two** limits: **10 requests per minute** and
**50 per day**. The first eval run discovered both the hard way.

That mattered more than the eval numbers, because of what the SDK does with
it. `new OpenAI({ apiKey })` defaults to `maxRetries: 2`, and a per-day 429
carries `Retry-After` measured in *minutes*. The SDK sleeps through it. The
harness looked hung for nineteen minutes with zero output; in production the
same default would have held a serverless invocation open for up to half an
hour before returning the 503 the route already has an honest message for.
Both now pass `maxRetries: 0` (harness) and `maxRetries: 0, timeout: 30_000`
(route).

**Split, deliberately.** `tests/smart-search-guardrails.test.ts` — 38 tests,
no key, no network, in `npm test`. `scripts/eval-smart-search.ts` — 43 real
calls, opt-in via `npm run eval:ai`, never in CI, same pattern as `test:db`.

The hermetic half is where the guardrails are actually proven, and that is not
a compromise. A live call cannot reliably produce a hostile model; a fixture
can. The headline case — *a fully cooperative injection returns
`category: nightlife`, `valid: true`, for a 15-year-old* — is a fixture, and
the post-model check returns 400 on it every run. Also covered: every
restricted category against every under-age caller, the array-payload hole
below, truncation, error mapping against real `OpenAI.APIError` instances,
and the pre-model length bounds.

**One real hole found, in `normalizeIntent`.** Arrays are objects, so `[]`
passed the `typeof value !== "object"` guard, every `raw.x` lookup returned
undefined, and the function produced a *fully defaulted intent reporting
`valid: true`* — a fabricated dinner search returned as a 200. Worse than an
error, because nothing downstream can tell it apart. Now rejected.
`strict: true` makes it unreachable from the model today; the whole point of
`normalizeIntent` is that it does not rely on that.

**Prose is never asserted.** `title` and `summary` vary run to run; an
assertion on them fails for reasons nobody can act on, and a suite people
learn to ignore is worse than no suite. Only `category`, `origin`,
`maxBudget`, `radiusKm`, `valid` are scored, `category` against a *set* where
the mapping is honestly ambiguous. Scored fields report a number against a
floor; adversarial cases are hard pass/fail at 100%, because a guardrail that
holds 29 times in 30 does not hold.

**Eval numbers: UNRUN.** Two scored cases got through before the daily cap
(both matched every asserted field); the other 41 never reached the model.
Two is not an accuracy number and is not reported as one. The harness now
paces at 8 rpm and aborts the whole run on the first per-day 429 — exit code
2, printed as UNRUN, explicitly not a pass and not a failure. Re-run when the
day rolls: one full run per day is the entire budget.

Gate green, 107 tests.
## 2026-09-07 — T1 Security/Backend: /login root-caused, and the E2E gate loosened correctly

**`/login` is root-caused, and it was my own test configuration.**
T0's hypothesis (a locally-built server vs a remote-built one) is disproven —
it fails with a remote build too. The actual variable is
`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, which I was setting and T0 was not. Same
build, same server, same port:

| Turnstile key | runtime-health |
|---|---|
| unset | **9/9 pass** |
| set to Cloudflare's test key | both `/login` tests fail, `page.goto` never reaches load |

The widget keeps the load event pending in a headless context. **Not a
product bug, but not purely environmental either, and this is the part worth
acting on: Turnstile is deprioritised, not abandoned. The day it is
configured, these two specs start failing in CI for a reason that has nothing
to do with the page being broken.** The fix belongs in the spec — navigate
`/login` with `waitUntil: "domcontentloaded"` rather than the default `load`
— which is qa/Frontend's file, so it is reported rather than edited here.

**There is a real tension in the same run, and it needs a decision:** the
guest/vote specs REQUIRE the Turnstile key (a production build gates guests
behind the captcha, so without a key they hit "Open this plan securely" and
never reach voting), while runtime-health's `/login` breaks WITH it. Both
cannot currently be satisfied in one invocation.

**A genuine accessibility finding, pre-existing:**
`layout-consistency.spec.ts` reports *"control 2 on /login shows no focus
indicator at all"* — `outlineStyle: none`, `boxShadow: none`. A keyboard user
cannot see where they are on the sign-in form. Fails with and without any of
my changes, and independent of Turnstile. Frontend's to fix; flagged rather
than touched.

**The E2E gate is loosened along the axis T0 asked for, without weakening
it.** `global-setup` no longer throws on a non-loopback target; it provisions
nothing and returns. Read-only specs (runtime-health, layout-consistency) run
anywhere — which matters because a preview deployment is the only place
WebKit coverage is possible. The specs that vote are gated on the fixture's
existence, so with no fixture they skip: **the protection is the absence of a
plan id, not a flag someone can set.** There is deliberately no escape hatch
that points a voting spec at production. A stale fixture from an earlier
local run is deleted on the non-loopback path so it cannot be picked up.

Verified both directions: remote target → 74 pass, 21 skip, voting specs
skip with a reason naming the cause; local target → 76 pass, all three vote
specs green.

**And I had reintroduced the very defect I removed.** All three write specs
shared ONE fixture plan while `fullyParallel` is on, so they voted on each
other's rows and their exact assertions broke — the same shared-fixture
problem that forced the original live spec to hedge with "went up by at least
one". Now one plan per spec (`tests/e2e/fixture.ts`, `planIdFor(name)`),
provisioned and torn down together, which also removes the read-and-parse
logic that had been copied into three specs.

---

## 2026-09-07 — T0: a `git add -A` swept a subagent's in-progress work

**Process error, mine, recorded because the history is now misleading.**

Commit `5fb0e89` is titled *"Correct the record: the app never reported a
wrong cause"* and its message describes a worklog correction. It also
contains **1,058 lines of the AI eval layer** — `lib/ai/intent.ts`, the
rewritten `app/api/smart-search/route.ts`, `scripts/eval-smart-search.ts`
and `tests/smart-search-guardrails.test.ts` — none of which I authored or
reviewed. A subagent was mid-task in this same worktree and `git add -A`
took its partial tree.

`bfa944a` has the same shape from the other direction: the agent's own
commit swept up work it had not authored.

**Nothing was lost and the tree is coherent** — gate green, 107 tests, build
clean, and `git status` empty. The damage is to the record: anyone reading
`5fb0e89`'s message will not know the AI layer is inside it, and `git log`
for `lib/ai/intent.ts` points at a commit about a worklog paragraph.

**The rule going forward: never `git add -A` while a subagent is working in
the same worktree.** Stage explicit paths. Worktrees isolate the four
terminal sessions from each other; they do **not** isolate a subagent from
its parent, and I had been treating the parent worktree as if only I wrote
to it.

Same class as the day's other findings — an operation that looked correct,
succeeded, and quietly did more than its description claimed.

---

## 2026-09-16 — T1: P1.1 free photo route measured, and it is ~20/82, not 40–55

**The spot list came from the repo seed files, not the live table.** The live
project (`zyojaoyatunjwgbivaqu`) is INACTIVE (paused); restoring it is the
owner's call. The 82 / 76-without-photo counts are seed-derived and have NOT
been verified against live `spots`.

**Two numbers that look contradictory, and are not:**
- **~10/82** (2026-09-06) was the ceiling *with no venue URLs known*: only 2
  spots had a URL, so the og:image extractor had nothing to aim at.
- **40–55/82** was my estimate once web search supplied the URLs.
- **Measured: 13 kept, of 76** (Brix and The Hundred excluded: Brix is an
  address conflict for the catalogue batch, The Hundred a generic shot). Plus
  the 6 held under 039, that's **~19/82**. The estimate was wrong. Quote the measured number.

Funnel: 76 venues → 57 official URLs found (4 web-search agents, then hand
review; Cocoa Room dropped as a branch mismatch) → 22 images fetched → 13
kept after visual pre-screen. Where it fell off:
- **34 of 57 sites fetched but had no usable og:image.** Most have no og:image
  tag at all (VOX, Reel, Roxy, Aquaventure, Wild Wadi, padel clubs, ...), and
  the page's `<img>` tags are logos and icons, so a fallback scraper would
  only produce more logos. Not built.
- **7 of 22 fetched images rejected on sight** (logos ×4, an ad graphic, a
  fashion ad for Dubai Mall, a rehearsal room for a live venue). 32%, same as
  the 33% last round. **The human review gate is load-bearing; do not
  optimise it away.**
- **A search agent returned a confident wrong URL:** 3fils.com is a different
  company. The page title caught it; og:image would have scraped it silently.

**Catalogue staleness, reported by the search agents and NOT independently
verified, UNVERIFIED until Places `businessStatus` or a human confirms:** Cove Beach (Caesars Palace rebranded), Hub Zero City Walk (closed
2020), Iris (moved from The Oberoi to Meydan), Q's Bar (at Palazzo Versace,
not Al Habtoor City), Black Tap (no Jumeirah branch), Cocoa Room (no JLT
branch), and Kickers, Hummingbird, The Nine not found at their listed
locations. A decided plan pointing at a closed venue is the worst failure in
`PLACES_INGESTION_SCOPE.md` §4. The Places pass should request
`businessStatus` to settle these.

**Places route (owner approved billing):** websiteUri + location + place_id
(+ businessStatus) only. Worst case 82 Text Search requests, ≤164 with one
retry each, inside the 1,000/month Enterprise free cap. Guard is a Cloud
Console daily quota of 200, not the in-code cap. **Google's own photos are
not used:** their terms forbid storing them, so serving them bills per page
view and scales with traffic. That's an owner decision with a number, not a
fallback.

**Places does not buy "all 82".** It fixes URL discovery (76→57 above). It
does not fix the 34 sites with no og:image. The bottleneck moves, it doesn't
disappear. Near-full coverage needs Google's own photos (per-view cost) or
owner-supplied images. Neither is built. No live call until the owner confirms the quota is set.

Nothing committed to the DB, the bucket or git besides this entry. Review
artefacts are in T1's scratchpad (`contact.html`, `results.json`).

---

## 2026-09-16 — T1: R1 plan delete, migration 047 STAGED (not applied)

`delete_plan(p_plan_id, p_host_token)` via `POST /api/plans/[id]/command`
`{command:"delete"}`. Hard delete, **open plans only**, caller must be the
plan's **creator AND** hold the host token (security review: a leaked
localStorage token must not be able to erase a plan). `status` unchanged.
Refusals are returned: `deleted` 200 / `not_found` 404 / `not_host` 403 /
`already_decided` 409; anything else 500. One audit row in `security_events`
per delete (plan id, participant count, actor), in the same transaction.

**Verified on a throwaway Postgres built from current schema.sql, not live
(project paused):** 16/16, including every refusal leaving the plan
untouched, cascade to votes/rsvps/plan_spots/tokens, the audit row, two
concurrent deletes resolving to exactly one, anon without execute. Not
exercised: delete racing `decide` (review traced it: same row lock, the
loser gets `already_decided` or a 403). `security` review: no C/H/M. Kept
Low: `not_found` before the token check reveals plan-id existence
(122-bit ids, id is the share link).

**Open risk, recorded not acted on:** the ~9 possibly-closed/moved venues
in the P1.1 entry above come from web-search agents only (one of which
returned a confidently wrong URL the same day). The catalogue is untouched.
Settle them with Places `businessStatus` when a key exists, not by search.

**Instrument trap:** an audit is only as current as the checkout it reads.
Today's schema.sql "drift" finding cited a stale `main` checkout, with no
signal in its output. Verify against a database built from the current file.

---

## 2026-09-16 — T1: friendship consent, migration 048 STAGED (not applied)

**The hole, reproduced (not source-read) on a DB built from current
schema.sql:** "add own friendships" left `friend_id` unconstrained. A signed-in
attacker inserted (me → victim) and went from 0 to all of the victim's visits
(note text included) plus their profile; the mirror trigger's (victim → me)
unlocked their friends-only photos. High, pre-launch (never deployed, project
paused).

**Fix: invite tokens, not a pending/accepted state.** Insert policy dropped
and table INSERT revoked. The only write path is `redeem_friend_invite(token)`
on a token from `create_friend_invite()` (256-bit, sha256 stored, 7 days,
single use, ≤20 open per inviter). `preview_friend_invite(token)` shows the
redeemer who they'd befriend first (security review, Medium: without it
consent is only as good as a name in an attacker-controlled link). Result
codes: friends / already_friends / self / invalid. Every existing read policy
is unchanged and now correct, because an edge's existence is the proof both
people acted. Unfriend stays one-sided.

**Verified on a fresh throwaway Postgres from schema.sql: 32/32** (exploit
refused, full flow, preview, self/reused/expired/garbage/already-friends, unfriend
removes both edges, two concurrent redemptions → one edge, cap, grants,
invites table unreadable). R1's 16/16 still pass on the same build.
`security` review (branch/commit echoed): no C/H after the preview fix.

**Supersede notes** added to migrations 007 and 028: re-applying either
after 048 reopens the hole.

**To verify when the project unpauses (source-only until then):**
- existing live `friendships` rows. addFriend never had a caller, so any
  present were hand-written and still grant reads. Owner decides, no purge
  without that.
- that the live insert policy really is 028's text before 048 drops it
- `mirror_friendship`'s owner role
- `authenticated`'s table-level INSERT on `friendships` (048 revokes it)

**T2 contract** (lib/social.ts is theirs): delete `addFriend` (it now fails
silently with 42501). Invite page: preview first, redeem only from an explicit
button that shows the previewed name, never on load. Token in the URL fragment
or `Referrer-Policy: no-referrer` on that route.

---

## 2026-09-16 — T1: voter user_id hidden from co-members, migration 049 STAGED (not applied)

**⚠ Apply order:** 049 must NOT be applied until T2's explicit column lists
for votes/rsvps/ratings (`app/plan/[id]/page.tsx`) are deployed. `select("*")`
gets 42501 once any column is withheld. Also `scripts/load/realtime-fanout.mjs:137`
(T3) selects `*` on votes with a user token. Added to the unpause checklist.

**Reproduced:** plan member B read member A's auth uid from votes, rsvps and
ratings. **Fix:** revoke table SELECT, grant every column except `user_id`.
RPCs/RLS use it as owner, unchanged. Realtime strips it too: v2.129.3
`apply_rls.sql` filters record and old_record via `has_column_privilege`, and
`subscription_check_filters.sql` refuses a `user_id=eq.` filter. **15/15 on a
fresh throwaway build** (the vote RPC still records user_id, members get
denied on user_id and on `*`, anon denied), and 047/048 suites still pass.

**Security review: correct, but PARTIAL. Not the whole uid exposure:**
- `plans.created_by_user_id`: every co-member still gets the HOST's uid
  (page.tsx select `*`, the full-row Realtime UPDATE, and
  `execute_plan_command` returning `to_jsonb(target)`). Medium.
- `spots.created_by_user_id`: any signed-in session (anonymous too) gets the
  uid of everyone who published a community custom spot, next to its address.
  Medium, and global. The app's narrow selects are cosmetic against direct
  PostgREST.
Both need client changes first (`lib/social.ts:611` and
`components/StartPlanForm.tsx:105` filter on the column), so they're a
separately sequenced follow-up (050), not folded in here.

After applying: compare `information_schema.column_privileges` with
`columns` for the three tables (live drift is unverifiable while paused).

---

## 2026-09-16 — T1: security controls no longer blame the user for a server fault

**Root cause (T2 found the sign-in symptom):** `consumeQuota` and
`consumeOtpLimit` in `lib/security/controls.ts` collapsed EVERY RPC error into
`false`, and all 8 callers rendered false as "too many". So a wrong or missing
`SECURITY_CONTROL_SECRET` in production would lock out sign-in AND every plan
create, host command, deal, search and link import, each telling the user they
were doing it too much. Refused, unavailable and rate-limited collapsed into one
value.

**Fix:** helpers return `"allowed" | "limited" | "unavailable"`. `limited`
only when the RPC returned false (a counter passed its cap). Any RPC error is
`unavailable`: fail closed, but say "temporarily unavailable" (503 on API
routes), and log `SECURITY CONTROL MISCONFIGURED: <scope> -- check
SECURITY_CONTROL_SECRET ...` from the caller AFTER its auth check.
consume_app_quota also raises with no session, so logging in the helper would
fire on every anonymous request. No `rate_limit` security_event on that path
(it needs the same secret, and the label would be wrong anyway). All 8 call
sites in one commit, including T2's two in `app/auth/actions.ts` (T0-approved).

**Trap:** `!(await consumeQuota(...))` still TYPECHECKS against a string
result, and every string is truthy, so a missed call site would silently
allow everything. Verified by grep that none remain.

**SQL states checked on the throwaway DB:** wrong secret → 42501; right
secret → true until the cap, then false; counters keyed per subject.

**P1.4 closed as already built:** migration 026's otp-verify bucket (8/min,
20/day per HMAC'd email) + `consumeOtpVerifyLimit` at `app/auth/actions.ts`.
Verified: 9 attempts → `t×8, f`, and another address is unaffected. It now
goes through the three-state result too.

Gate green: lint, typecheck, check:schema, 111 tests, build.

---

## 2026-09-16 — T1: creator uid hidden on spots/plans (050 + 051 STAGED), apply runbook, /api/health

**050 + 051 close the two leaks the 049 review found.** `spots.created_by_user_id`
gave ANY signed-in session (anonymous included) the uid of everyone who
published a community custom spot, next to its address. `plans.created_by_user_id`
gave members the host's uid. 051 = column grants without it. 050 = the owner-only
reads that filtered on it, as definer RPCs (`my_custom_spots`,
`count_my_hosted_plans`, `search_path = ''`), plus `execute_plan_command`'s
return minus the column.

**A PostgREST computed field (`is_mine(spots)`) was the approved design and
does NOT work:** a whole-row reference needs SELECT on every column, so it is
refused the moment one column is withheld (verified). Replaced by the two RPCs.

**Verified against a real PostgREST v16.1 + throwaway DB, 23/23:** uid denied
to stranger / anonymous user / anon role / via filter / via embed; community
and curated reads intact; RPCs return only own data; the creator reads their own
plan through a policy on the hidden column; owner insert/update/delete of custom
spots still work; a stranger's delete affects 0 rows; the host command response
has no uid. 047/048/049 suites still pass on the same build. Security review: no
server-side path left. It found one more client break (`lib/social.ts:52`
`spots(*)` embed → visit history on home), now in 051's header and the runbook.
Realtime on plans: source-verified, not run.

**`supabase/APPLY_RUNBOOK.md`:** ordered live apply from unpause to HEAD, with a
catalog preflight query (tested) instead of trusting the ledger, the client
deploys that must precede 049 and 051, per-step verify lines, scripts that
break, and the stopgap undo for the two grant steps.

**`/api/health`:** 200 `{"status":"ok"}` only if an anon PostgREST read of one
curated spot succeeds within 3s; otherwise 503, with no detail in the body.
Tested on a webpack dev server: healthy → 200 no-store; PostgREST down → 503;
table missing → 503 (log PGRST205).

Stopping new migrations here per T0 (MVP tonight). R2/R3/R7/R8 held.

---

## 2026-09-16 — T1: apply runbook rehearsed end to end; six defects fixed in it

Rehearsed `supabase/APPLY_RUNBOOK.md` on a throwaway Postgres + real PostgREST
v16.1 built at the **live-through-045 state** (`schema.sql` at `ec1c647`, last
changed by 045), with fixtures shaped like live, and an old client (today's
reads) plus the new client (T2's changes) exercised after every step.
**112/112** in the original order, **32/32** in the simplified order now in
the runbook. Every migration re-runs cleanly; both stopgap undos restore the
old client, and re-applying re-hides.

**Defects the rehearsal found in the runbook (all fixed):**
1. **The step-4 grep gate could never pass:** it matched every `select("*")`,
   including `plan_spots` (untouched by 049/051) and a comment. Now
   table-specific, with commit-ancestry as the primary gate.
2. **The gate false-passed in zsh:** `"$SHA:app/..."` is a zsh modifier, so
   `git show` failed and `grep -c` printed `0`. It showed a pass while today's
   tree should fail. Now `"${SHA}:path"`, plus a file-existence guard so a
   rename prints MISSING instead of `0`. Verified in zsh and bash.
3. **Pipes in a markdown table** turn into `\|` and break the pasted shell
   command. The gate moved to a code block.
4. **The live-policy check said `auth.uid()`**; Postgres prints
   `( SELECT uid() AS uid)`, so a correct live policy would have read as
   different. The runbook now quotes the exact printed text.
5. **Several verify lines were prose.** All are now pasteable SQL returning
   `t`, each confirmed.
6. **"Function not found" right after an apply is real and transient**
   (PGRST202 on `my_custom_spots` right after 3 back-to-back applies,
   recovered within 1.5s). Documented so nobody reads it as a failed migration.

**Order simplified to ONE client deploy:** 047 → 048 → 050 (additive, the old
client is proven unaffected) → deploy all of T2's changes → 049 → 051. The
two-deploy order also passes.

**Not proven:** the base is an end-state file, not a replay of live's history;
Realtime column stripping; T2's actual committed code (simulated with the
exact calls T2 was given); 046.

**Side fix:** this worktree's `node_modules` was a symlink to
`~/plan-ind/node_modules` (the board says real directories). That's why
Turbopack `next dev` failed. Replaced with a real `npm ci`; Turbopack now
starts. The other worktrees were already real directories.

---

## 2026-09-16 — T1: runbook gate filled with real commits and proven both ways

**The headline finding of the rehearsal, stated plainly:** the step-4 gate
existed to stop 049/051 being applied before their client changes. In zsh,
`"$SHA:app/..."` is a variable modifier, so `git show` failed, `grep -c`
printed `0`, and **the gate reported PASS on a tree that must be blocked**.
That's the repo's signature bug (a failure presented as a plausible success)
inside the mechanism built to prevent it. On the owner's live project it
would have waved through exactly the mistake it guards against.

The gate now prints `ok` or `BLOCK: <reason>` per line (a failed check can
no longer print nothing), uses `${SHA}:path`, and checks file existence first.
Placeholder replaced with T2's real `b8b19c7`. **Proven against real commits,
in zsh and bash:**
- `ec1c647` → 6 BLOCK; `4d074b3` → 4 BLOCK; `b8b19c7` and current
  `ai-engineering` → 1 BLOCK: StartPlanForm/Wrapped still `.eq("created_by_user_id")`.
  **T2's edits 1+2 (the `my_custom_spots` / `count_my_hosted_plans` swaps) have
  not landed, so 051 is correctly still blocked.**
- A throwaway detached commit with those two edits applied (never on a branch,
  worktree removed) → all `ok`.

---

## 2026-09-16 — T1: runbook executable end to end; Realtime column stripping proven

**Gate:** added T2's `7f58c30` (saved places / Wrapped via 050's RPCs). **Zero
BLOCKs on `7f58c30` and current `ai-engineering`** in zsh and bash (10/10
ok). It still blocks on `b8b19c7` and every earlier commit. T2's exact
custom-spot insert, which is the one client path still naming
`created_by_user_id`, returns 201 under 051. Clients hold INSERT but not
SELECT on that column, and the spot comes back via `my_custom_spots`.

**Realtime, proven rather than read:** a real realtime v2.129.3 container on the
rehearsal DB, with a plan member subscribed to `plans` and `votes`. After
049+051, no `created_by_user_id`/`user_id` in `record` or `old_record` for
UPDATE/INSERT/DELETE, while the change itself still arrives. **The negative
control makes the check falsifiable:** with the stopgap undo applied, both
columns appear. A `created_by_user_id` filter is refused while an `id` filter
subscribes. 21/21.

**Two harness traps on the way, recorded because each would have produced a
wrong answer:**
- My DB builder stubs a minimal `realtime` schema for `schema.sql`'s presence
  policies. Under real Realtime that stub broke its migrations, so EVERY
  subscription failed. A "filter refused" check that accepted any error then
  PASSED for the wrong reason. Fixed by letting Realtime build its own schema
  first, and by a positive control (normal subscriptions must confirm and
  deliver events) that any refusal check now sits behind.
- Deleting a vote immediately after inserting it made Realtime drop the INSERT
  event (it checks access against the live row). That's pre-existing Realtime
  behaviour, not ours; worth knowing for anything measuring rapid toggles.

Lane critical path done. Holding; R2/R3/R7/R8 not started.

---

## 2026-09-16 — T1: LEDGER CORRECTION from the live preflight, and the corrected apply sequence rehearsed

**The live project was probed read-only after unpause (ACTIVE_HEALTHY confirmed
first). The ledger was wrong three times:**
- **027 is NOT live**: `spots_name_idx` is absent.
- **028 is NOT live**: both friendship write policies are still 007's
  `exists(select 1 from people p ...)` form. Reproduced on a live-identical rig:
  **every friendship write fails with `42P17 infinite recursion`**. Reads of
  people/visits/friendships/photos do not recurse. No UI writes friendships
  today, so no user has hit it.
- **039 IS live** (recorded as held): 6 `photo_url`s, all 6 files in
  `spot-photos`, sample served 200 image/jpeg.
- Also: `friendships` 0 rows and `people` 0 rows (no hand-written edges to
  decide about; still zero permanent accounts); 6 plans; 82 curated spots.
- **Stray on live:** policy `plan_spots."advance plan_spots"` (UPDATE, all
  roles, `using true`) from 009 survives although 015 dropped it (009 re-run
  after 015). Inert because clients have no UPDATE grant on `plan_spots`.
  Needs a cleanup migration later.

**027: not superseded, deferred.** 040's GIN trigram index serves `ilike`
search but cannot serve `/home`'s `order by name limit 120` (EXPLAIN with seq
scans disabled still sorts; with 027 it is an index scan). At 82 rows the query
takes 0.13ms. Not needed tonight.

**Rehearsal rig now IS live, verified rather than assumed:** rebuilt with live's
differences, then asserted equal to live by 7 checksums read from live (175
columns, 314 table grants, 52 function grants, 26 normalized function bodies,
69 indexes, 33 policies, 12 triggers). The first diff also surfaced the stray
policy and 7 function bodies that differed only in comments/keyword case.

**Corrected sequence 028 → 047 → 048 → 050 → [deploy] → 049 → 051: 94/94.**
Negative controls prove 028-before-048 is a real constraint: before 028 a real
unfriend fails with 42P17, and 048 alone leaves it recursing. After 048 a real
invite → redeem → unfriend works with no recursion and removes both edges.
Every runbook verify line returns `t`. Re-running 028 alone after 048 recreates
the insert policy, but inserts stay refused because 048 revoked the table grant.

Runbook updated: preflight rows for 027/028, 039 expects its 6 photos, step 0 =
028, 046 off tonight's path and additive to the live 6.


---

## 2026-09-16 — T1: 028, 047, 048, 050 APPLIED LIVE (owner-approved); 049/051 held

Owner approval relayed by T0 and confirmed directly in T1's session before the
first write. The preflight immediately before step 0 matched the rehearsal
exactly: same rows, and the same 7 schema checksums, so live had not moved
since the 94/94 rig was proven equal to it.

One migration at a time, each verified `t` on live before the next, no
hand-edits, sent verbatim from the committed files:
- **028** 19:23:38Z: friendship write policies no longer recurse.
- **047** 19:24:05Z: `delete_plan` live; anon cannot execute.
- **048** 19:24:48Z: live PostgREST direct friendship insert → `42501
  permission denied`; invite RPCs refuse anon; `friend_invites` RLS on, no
  policies. No real accounts or friendships were created on live (the invite
  path was proven on the rig).
- **050** 19:25:37Z: old client (the only one deployed) still reads curated
  spots and categories with data. The 11 read policies on
  plans/plan_spots/votes/rsvps/ratings/spots are byte-identical to pre-apply.
  `execute_plan_command` no longer returns the host uid.

No PGRST202 surprises. **049 and 051 NOT applied**: they wait for the Vercel
deploy and the step 4 gate. The `advance plan_spots` stray was left alone as
instructed. Ledger table corrected: 027 not live, 028 now live, 039 live.

---

## 2026-09-16 — T1: C2 confirmed, C8 migration 052 STAGED; OPEN HOLE → migration 053

**C2 (settings: name/emoji) needs no backend.** Live: authenticated has UPDATE
on `people.display_name`/`emoji`; policy "update own permanent profile";
`people_before_write` pins `id`/`auth_user_id`; constraints bound lengths. The
client must use `.update(...).eq("id", uid).select("id").single()`: an RLS
refusal updates 0 rows with NO error.

**052 (staged, not applied):**
- `people_display_name_safe`: same control/bidi guard as emoji, because names
  reach strangers through `preview_friend_invite`.
- **"edit own visits" UPDATE policy + column-scoped UPDATE** (`visited_at`,
  `group_label`, `note`). **Edit-visit is silently broken on live today**: no
  UPDATE policy, so an edit returns 200 with 0 rows.
- `unrate_plan(p_plan_id)`: matches `user_id = auth.uid()` ONLY.
Security review: no C/H/M; L1 adopted (`people_before_write` now sanitises names
with `clean_app_text`, so a direct rename strips unsafe chars like sign-up does,
and the CHECK still refuses them if triggers are bypassed); L2 = runbook
pre-apply count (live: 0 people); L3 accepted (unrating frees your voter_name).
Verified 30/30 through real PostgREST on a rig proven equal to live after the
028/047/048/050 applies (7 checksums), with negative controls for the edit
no-op and RTL-name acceptance before 052. logVisit's delete-then-insert path
and its 23505 retry still work.

No SQL for delete-collection (already allowed) or delete-photo/delete-visit
(owner delete policies exist). Their correctness is the client's file-first
ordering: Storage API remove BEFORE the row, stop on any file error, retry
converges. Contract to T2/T3.

**Retention bug for T2:** `logVisit`'s `clearPlanConflict` deletes a previous
visit to re-log it, which cascades `visit_photos` rows and orphans their
storage files. It needs the same file-first step.

### ⚠ OPEN, BOUNDED, KNOWN HOLE: legacy participant rows can be claimed by hash (→ migration 053)

`rate_plan`, `cast_plan_vote` and `set_plan_rsvp` guard against touching a row
owned by someone else only when that row's `user_id` is NOT null. Rows written
before 043 have `user_id` null, and `participant_token_hash` is readable by
plan co-members (also after 049). So a co-member can present a legacy row's
hash and overwrite or claim it.
- **Counted live 2026-09-16: 3 ratings, 25 votes, 17 RSVPs with `user_id` null**,
  all on the 6 pre-existing plans. Live has 0 permanent accounts.
- **Why bounded:** every new row carries `user_id` and the existing guard
  protects it; the exposure is limited to those 45 legacy rows.
- **Not fixed in this wave** (T0, 2026-09-16): the fix rewrites the three core
  voting RPCs while T2 is re-walking that loop.
- **Must fix before public launch.** Options: (1) migration 053, where the
  three RPCs refuse to touch a row whose `user_id` is null, with its own rig
  rehearsal and a round-trip proving new rows still vote/RSVP/rate; or (2)
  **owner's call, a live data write:** if the 6 old plans are confirmed test
  data, delete their 45 legacy rows, which closes it with no function changes.

---

## 2026-09-17 — T1: migration 052 REVISED (supersedes the reviewed 90c04dc/4a345f3 text), still STAGED

Changes since the first review, each re-reviewed by `security` (no C/H/M on any pass):
- **Emoji "not chosen" = NULL.** `ensure_authenticated_profile` (020) ignored its
  `p_emoji`/`p_color` and hardcoded `'?'`, while the column defaulted to `'🙂'`.
  Now: column nullable (default NULL), colour default `'#34363b'`, existing
  `'?'` rows set to NULL (live: 0 people), and the RPC honours a passed
  emoji/colour. Emoji sanitising and `''`/`'?'`→NULL live in `people_before_write`
  (one path for every write). `lib/types.ts`: `emoji: string | null`. No current
  UI reads `people.emoji`/`color` (avatars derive from the name), so no literal
  `null` can render.
- **Display names: one sanitiser, `clean_display_name()`, used by the trigger AND
  the CHECK** (`display_name = clean_display_name(display_name)`), so they can't
  drift. Reproduced on the rig first: 10 invisible characters (ZWSP, ZWNJ, ZWJ,
  WJ, BOM, ALM, Hangul filler, soft hyphen, CGJ, NBSP) survived and made "Alice"
  look-alikes. Now: Unicode spaces → space, runs collapse; control (explicit
  code-point ranges, not locale-dependent `[[:cntrl:]]`), bidi, format, filler,
  tag, variation (except VS16) and braille-blank characters stripped;
  **ZWJ/ZWNJ kept where scripts and emoji need them** (Persian ZWNJ, family
  emoji) and removed only at the ends, next to ASCII, or repeated; re-trimmed
  after the 40-char cut. Existing names are normalised before the CHECK is added.
  Known limits, recorded in the header: homoglyphs, and a ZWJ between Arabic
  letters that already join (054's shared-plans signal is the answer).
  ⚠ `clean_display_name` must stay executable by `authenticated`: the CHECK calls
  it on every people write.
- `people_before_write` has a pinned `search_path`.

**Verified:** 70/70 through real PostgREST on a rig proven equal to live after
the 028/047/048/050 applies, plus a 30,000-case fuzz (29,449 distinct inputs):
0 non-idempotent, 0 over 40 chars, 0 edge spaces, 0 C1 controls left.

**Harness trap (recorded because it gave a false pass):** the first fuzz reported
0 failures across "20,000 cases", but its random-string subquery was
uncorrelated. Postgres evaluated it ONCE, so all 20,000 inputs were the same
string. Caught by counting distinct inputs (1). Always assert the generator's
diversity before trusting a fuzz result.

---

## 2026-09-17 — T1: migration 054 STAGED (friend invite trust signal M1 + cap race I1)

- **M1:** `preview_friend_invite` also returns `shared_plans` on a valid result:
  the count of plans the inviter and the redeemer have both joined
  (`plan_access`; creators have a row). Count only: no plan names, nothing about
  third parties, nothing on invalid/self. Deliberately simple. **Known limit:**
  `claim_plan_access` admits anyone with a plan id, so a leaked share link can
  inflate the count, and (review Low) a leaked invite token can probe whether
  the inviter joined a plan the prober also knows. Both close with the
  `claim_plan_access` must-fix-before-launch item.
- **I1: a real race, proven.** On 048's function, **25 parallel creates all
  succeeded (cap of 20 bypassed)**. With a per-inviter
  `pg_advisory_xact_lock`, exactly 20 succeed and 5 are refused (54000). The same
  call deletes the caller's own used/expired invites older than 7 days (never a
  live one). `create_friend_invite` must stay VOLATILE (fresh snapshot per
  statement after the lock).
- Verified 15/15 on the live-identical rig + 052 via PostgREST, with a
  negative control. `security` review: no C/H/M.
