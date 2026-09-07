# Deal three worklog

Last updated: 2026-09-04 (Asia/Dubai)

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

## 2026-09-05 — T1 Security/Backend: coordinate backfill (staged) + a benchmark that came back null

**The gap.** All 82 curated spots had null `latitude`/`longitude` on the
live project, so "getting there" (haversine distance + Maps link, shipped
that morning) could never render for a real user. Not a code bug — missing
data.

**Backfilled 40 of 82, not 82, and the gap is the point.**
`scripts/backfill-spot-coordinates.mjs` geocodes against Nominatim (OSM's
free geocoder — no paid Places API, per the standing call), sequentially at
~1 req/sec with a real User-Agent per their usage policy. It only reads the
live catalog and writes a local review file; it never touches the database
and no live code path depends on it. One-off, not a pipeline.

The strict `"name, area, Dubai"` query matched 27. A looser name-only
fallback matched 26 more — and **half of those were the wrong venue**.
"DRIFT Beach Dubai" matched Drift Burgers. "Garage Dubai" matched the Dubai
Mall Zaabeel Parking Garage. "BLU Dubai" (Al Habtoor City) matched Radisson
Blu Deira Creek. McGettigan's and VOX each matched a real branch, just the
wrong one. 13 rejected by hand, 13 kept.

The other 42 stay null deliberately. A null hides the distance line; a wrong
coordinate walks somebody to the far side of the city. Loosening the query
further is what produced the bad matches, so the remainder wants a hand
lookup, not a cleverer script. Coordinates live only in
`migration-037-backfill-curated-coordinates.sql`, with a pointer from
`seed-categories.sql` rather than a duplicate copy that would drift the
moment one of the 42 is hand-corrected. Updates are keyed by id and guarded
on `latitude is null`, so a re-run can't clobber a correction. Validated on
the local stack: 40 rows on the first run, 0 on the second. **Staged, not
applied** — owner's call, same as every migration here.

**Benchmarked 7c69a9c (T0's `Promise.all` on `getUser` + `consumeQuota`):
real uncontended, null at the ceiling.** n=1: 61.6ms → 56.3ms median p50,
winning 12/12 paired reps — about one local round trip, which is exactly
what was removed. n=50 and n=100: nothing outside run-to-run noise, and the
~n=100 ceiling did not move. The README's stated cause looks simply wrong —
the wall isn't serial round trips, it's one `next start` process saturating,
and firing two queries at once doesn't shrink the queue behind them. Kept
the change (free, less waiting, worth more off-loopback), recorded as a null
result rather than dressed up as 3%.

**Method note, because it nearly fooled me:** measuring one build then the
other showed a clean ~40% win that was entirely JIT warm-up — a cold server
runs ~2x its warm self, dwarfing the effect. Rebuilt to run both commits
simultaneously on separate ports with alternating paired reps and discarded
warm-up rounds; `scale.mjs` takes `LOAD_APP_URL` for this now. Any earlier
sequential before/after number in this repo is suspect for the same reason.

Also documented a setup trap: with `app_control_secrets` unseeded locally,
every quota-gated route returns 429 "Too many deals" on a fresh user's first
request — actually `consume_app_quota` raising 42501 and `consumeQuota()`
failing closed.

Commits: `b733703` (geocoding + migration 037, staged), `4e5a68b`
(benchmark + harness). Gate green throughout.

---

## 2026-09-05 — T1 Security/Backend: one account through the whole arc

`scripts/verify-journey.mjs` walks a single fresh account end to end against
the local stack and asserts the real rows at every hop: sign up → profile →
age → deal → create (voting path *and* direct path) → share → a second
identity claims access → pool votes → advance → final vote → decide → the
last mile (event/booking) → RSVP with carpool fields → rate → log the visit
→ Been → collection. A third identity is a negative control throughout.
**82 checks across 19 steps, 80 passing.**

**The seams hold.** `plan_access` gates an uninvited identity out of the
plan, its spots, and voting (42501). The host token is stored only as a
SHA-256 hash. `stage` gates `phase`, so a pool vote is refused once the
final round opens. One participant token carries the same `voter_name`
across vote → RSVP → rating. A re-vote replaces a pick rather than adding a
second row. Direct plans land `decided`/`decided` with one advanced
`plan_spot` and a host `plan_access` grant.

**Finding 1 — `set_plan_rsvp`'s null-choice guard doesn't guard.**
`p_choice not in ('coming','maybe','no')` evaluates to NULL, not TRUE, when
`p_choice` is NULL, so the `or` never fires and a null choice reaches the
insert and dies on the column's NOT NULL as a raw `23502` instead of the
intended `42501`. **Not reachable from the UI** — `setRsvp` in
`app/plan/[id]/page.tsx` is typed to the three literals — and there is no
integrity impact, so this is latent, not live. Migration 035's newer
`p_transport` guard avoids exactly this trap (`is not null and ... not in`);
the older `p_choice` line never got the same treatment. One-line fix; worth
riding along with the next migration rather than opening its own approval
round.

**Finding 2 — a decided plan still can't show "getting there".** The
journey's winner had null coordinates *on a stack that already has migration
037 applied*. Per category this is much sharper than "42 are null":

| coverage | categories |
|---|---|
| 0% | beach_club, escape, padel, wellness |
| 25-40% | brunch, dessert, karaoke, shisha, nightlife, water, dinner |
| 50-75% | games, sports, adventure, family, live_music, beach, cafe, movie, vibes |

Four categories can **never** render a distance line, and dinner — the
most-used category — sits at 40%. If the owner wants the last mile to feel
real, hand-pasting coordinates for those four categories (12 spots) buys
more than any further geocoding would.

**Two of my own assumptions were wrong first**, recorded so the next person
doesn't repeat them: voting is one selection per (participant, round), not a
yes/no per card — a `false` value DELETES your pick rather than recording a
"no" — and the transport value is `need_ride`, not `needs_ride`.

Commit `5b1ce3b`. Gate green (lint/tsc/38 tests). No schema change, no
migration, nothing applied.

---

## 2026-09-06 — T1 Security/Backend: journey extended to the flows off the spine

`scripts/verify-journey.mjs` now runs **120 checks across 29 steps, 116
passing**. Steps 20-29 cover what the spine didn't: the venue-link import
write path, visit photos, friends, and Wrapped. Same file, same assertion
style — an extension, not a framework.

**Venue-link import, verified end to end for the first time.** The write
path needed a permanent account, which the local stack now provides. A link
whose title names a curated spot resolves to that spot and lands in the
caller's own default collection. A re-save into a second collection reuses
the row and does **not** reset a resolved import to pending (the
fetch-then-insert design holds). Instagram — no credentials by design —
fails honestly as `needs_input`/`unsupported_provider` rather than
pretending to have looked. Two genuinely concurrent first-time saves of the
same new link both return 200 with the same id and leave exactly one
`place_imports` row and one collection item: the 23505 recovery path works
under a real race, not just in theory.

**Photos, friends, Wrapped all hold.** A photo uploads only under the
caller's own uid folder; uploading into another user's folder is refused;
the signed URL comes from the caller's own session and the friend
**cannot** sign a URL for it (private bucket, folder-scoped policy, no
server credential anywhere in the path). Friendship mirrors to both
directions on insert and clears both on delete. Wrapped's numbers are
asserted against rows this run created — exactly 2 plans, 1 visit, the
winner's spot, the 5 stars submitted — not merely non-empty.

**Finding 3 — a large page loses metadata it already downloaded.**
`safe-fetch.ts`'s `readCapped` enforces its 512KB limit by **throwing**, so
any page over the cap resolves to `fetch_failed` ("response was too large")
even though `<title>` and the `og:` tags arrived in the first chunk.
Verified directly rather than assumed: the first 512KB of the Burj Khalifa
article contains the title and 5 `og:` properties. Truncating at the cap and
parsing what was read keeps the SSRF/DoS protection intact — the point of
the cap is never reading more than 512KB, which truncation also satisfies —
and makes the feature work on large pages. User-visible: paste a link to a
big page, the app says it can't read it.

**Finding 4 — an exact title match refuses to resolve.** `match.ts`'s
`overlapScore` divides by `min(a.size, b.size)`, so a spot whose entire
post-stopword name is a single token scores a perfect **1.0** against *any*
title containing that word. On a "Mall of the Emirates" title, "The Dubai
Mall" → `{mall}` ties at 1.0 with the genuine exact match; `RESOLVE_MARGIN`
sees no gap and sends the user a pick-one list instead of the obvious
answer. **17 of the 82 curated spots have a single-token effective name**
(3Fils, Bounce, Iris, Ninive, OliOli, QDs, Saffron, Shimmers, SoBe, The
Fridge, The Nine, …), so this is systemic, and the same asymmetry means a
title like "Saffron risotto" will surface a venue.

Both reported, neither patched — that was the instruction and it is the
right call: the fix for #4 in particular is a scoring-semantics decision
(asymmetric containment vs. a length floor), not a mechanical edit.

Parked and deliberately untouched: `set_plan_rsvp`'s `p_choice` null-guard
(rides along with the next migration out) and the coordinate coverage gap
(needs the owner's 12 hand-pasted values).

Commit `9b6a487`. Gate green (lint/tsc/38 tests). No product code changed,
no migration, nothing applied.

---

## 2026-09-06 — T0: migration 037 applied live (owner-approved)

**Owner approved 037 explicitly ("i approving migration 037"); applied via MCP
against `zyojaoyatunjwgbivaqu`, verified by query, not assumed.**

Pre-checked the file before running rather than trusting its header: 40
`update` statements, 40 distinct ids, every one guarded `and latitude is
null`, zero DDL and zero destructive keywords (`drop|delete|truncate|alter|
grant|revoke` all absent). Idempotent by construction — a re-run is a no-op.

**Before:** 82 spots, 0 with coordinates. **After:** 40 with coordinates, 42
still null (the deliberate rejects — 29 with no Nominatim match, 13 that
matched a *different* venue). All 40 land inside a UAE bounding box
(lat 24.814–25.266, lon 55.129–56.160); the two out-of-city outliers are
Hatta and Al Qudra, plausible for `escape`/`adventure`.

**Correction to a number that was on record.** The repeated "42 are null"
figure came from the *local* stack, where 037 had already been applied. Live
had **all 82** null until today, because 037 had never been applied there —
so `getting there` could not render for any spot, in any category, for any
real user. Worth stating plainly: the local figure was right about local and
silently wrong about production, which is the failure mode of quoting a
number without its environment.

**Live category coverage now** (this is what decides whether the distance
line can render):

| coverage | categories |
|---|---|
| 100% | culture, outdoors, shopping |
| 67–75% | adventure, beach, cafe, family, live_music, movie, vibes |
| 25–50% | brunch, dessert, dinner (40%), games, karaoke, nightlife, shisha, sports, water |
| **0%** | **beach_club, escape, padel, wellness** |

The four zero-coverage categories still cannot ever render a distance line —
12 spots, unchanged by this migration and not fixable by more geocoding
(they are the ones Nominatim could not match or matched wrongly). Hand-pasted
coordinates remain the only fix, still the owner's call.

Migrations 035 and 036 remain staged and unapplied.
## 2026-09-06 — T1 Security/Backend: both import findings fixed, scoring re-derived

Findings 3 and 4 from the journey run are fixed, measured, and pinned with
regression tests. Journey now **118/120 across 29 steps** — the only two
failures left are the deliberately parked items (`p_choice` null-guard,
coordinate coverage).

**#3 — `readCapped` truncates instead of throwing** (`safe-fetch.ts`). The
cap's guarantee is "never read more than 512KB from an arbitrary host", and
stopping at the limit satisfies that exactly as well as aborting did — but
aborting also threw away metadata that had already arrived, so any page over
the cap failed with "response was too large" while holding its `<title>` and
`og:` tags in the first chunk. Reader is still cancelled the moment the cap
is hit. Both consumers degrade safely **by construction, not luck**:
`web-adapter`'s regex requires a *complete* quoted attribute value, so a cut
mid-attribute yields no match rather than a garbled title; `oembed` already
converts a JSON parse failure into a `SafeFetchError`, so oversized JSON
still lands as `needs_input`; and a multi-byte character split at the
boundary decodes to U+FFFD under the non-fatal decoder rather than throwing.
Five unit tests cover the boundary, including the straddling-tag and
split-character cases.

**#4 — symmetric F1 scoring replaces the `min()` divisor** (`match.ts`).
`min(a.size, b.size)` only asked "is this name contained in the title",
never "does this name explain the title", so a one-token name scored a
perfect 1.0 against any title containing that word. **Measured on the real
82-row catalog, not a fixture:**

| | exact-name self-resolve | confident false positives |
|---|---|---|
| `min()` | 77/82 | **6/6** |
| F1 | **82/82** | **0/6** |

The false-positive column is the part I had under-reported: under `min()`
*every* adversarial title resolved confidently — "Saffron risotto recipe"
→ Saffron, "How to grow an iris in your garden" → Iris. Worse, `min()`
actively mis-ranked real cases: on **Kite Beach's own title**, "O Beach
Dubai" → `{beach}` outranked Kite Beach itself. So this was never only "exact
matches don't resolve"; it was also "unrelated pages resolve to a venue".

**Thresholds re-derived, not carried over.** `RESOLVE_FLOOR`/`RESOLVE_MARGIN`
were tuned against `min()`'s distribution and mean nothing under F1, so I
swept them against the real catalog:

```
floor   margin .05/.10/.15        margin .20
0.50    82/82, 1 false positive   80/82
0.60    82/82, 0 false positives  80/82
0.65    82/82, 0 false positives  80/82
0.70    60/82 (collapses)         60/82
```

0.6/0.15 sits inside the safe plateau and **stays unchanged** — but now
because it was verified against F1's distribution, not because it was
inherited. Of the margins holding 82/82 with no false positives, 0.15 is the
most conservative (largest gap demanded before auto-resolving), so it is the
right one to keep. The sweep is recorded in `resolve.ts` next to the
constants.

Three matcher regression tests pin both directions of the old bug (a short
name must not tie with the title's real subject, must not score against an
unrelated title, and must still win its own title outright).

`readCapped` is now exported solely so the boundary is testable without a
network round trip, and `tests/resolve-aliases.mjs` gained a
`server-only`/`client-only` → empty-module shim: that package's only job is
to break a *client bundle*, which a `node --test` run does not have, so the
real Next build still enforces the boundary unchanged.

46 unit tests (up from 38). Gate green.

**`security` review of the truncation change** — sound, with one real
(pre-existing) finding that my own new comments had made worse by asserting
a bound the code did not provide:

- **The 5s timeout only covered the response head, not the body stream.**
  `clearTimeout` fired in the `finally` attached to `fetch()`, i.e. the
  moment headers arrived, leaving `readCapped` streaming with no deadline. A
  host that sends headers instantly and then dribbles one byte per second
  held the request open for days without ever exceeding the byte cap — the
  reviewer measured it still reading after 15s, 27 bytes in. Not introduced
  by the truncation change (the old loop had to read 512KB+1 before it could
  throw, so it held just as long), but `resolve.ts` and the place-import
  route both claim "worst case adds ~5s", which was simply untrue. **Fixed:**
  the timeout now stays armed across the body read, `return await` so the
  `finally` runs after streaming completes rather than before, and an abort
  mid-stream is converted to a `SafeFetchError` instead of leaking a raw
  `AbortError`. Verified 5007ms → SafeFetchError against a stubbed
  slow-dribble host. Not committed as a test: pinning it costs 5s of real
  wall time in a suite that currently runs in 0.4s, and the explicit comment
  is the cheaper guard.
- **My "no garbled value" claim was right but stated too broadly.** The
  regexes have no anchors or lookarounds, so any match in a truncated prefix
  is a match at the same offset in the full document — a captured value
  always exists verbatim in the real page, so truncation can never
  synthesize or garble one. What it *can* change is which tag wins, because
  `metaContent` falls through to a reversed-order fallback when the forward
  pattern's match spans the cut. No trust impact (the page author controls
  every candidate on their own page), but the comment now says this
  precisely instead of claiming more than it should.
- The straddling-tag test was re-declaring web-adapter's regex, so it could
  have passed while the real code drifted. It now calls the exported
  `metaContent`, and a second test pins the verbatim-substring property that
  is the actual reason truncating is safe.
- No concern with exporting `readCapped` (it holds no part of the SSRF
  boundary — host validation, redirect re-validation and the content-type
  gate all stay in `safeFetch`, and the client barrel does not re-export it),
  and the `server-only` shim was confirmed unable to affect the real build:
  enforcement is webpack-side (`next/dist/build/webpack-config.js`), which a
  Node ESM resolve hook cannot reach.

**Not fixed, reported instead** (pre-existing, out of scope for these two):
there is no length cap on the extracted title between `web-adapter` and the
`extracted_data` jsonb write, so a hostile page can persist a ~512KB title.
Unchanged by this work and never rendered today; the natural place for a
`.slice()` is whenever someone builds the "show why it matched" UI.

47 unit tests. Journey 118/120. Gate green.

---

## 2026-09-06 — T0: migrations 035 + 036 applied live (owner approved all)

Owner: "apporove all migrations". Applied via MCP, each verified by catalog
query rather than assumed. **035, 036 and 037 are now all live; the
`supabase/` directory has no unapplied migration left.**

**035 (carpool fields).** Verified: both columns present, the
`rsvps_seats_only_when_driving` constraint present, and **exactly one**
`set_plan_rsvp` — the old 5-arg signature dropped cleanly rather than
leaving an overload, which was the specific trap 035's author flagged when
writing it. Grants correct: `anon` cannot execute, `authenticated` can.
The frontend one-liner that had to land before or alongside this (passing
`p_transport`/`p_seats_available` so an ordinary RSVP tap can't null a
carpool answer) was **already shipped** — verified at
`app/plan/[id]/page.tsx:488-489` before applying, not assumed.

**036 (moodboards).** Verified: RLS enabled on both tables, one
ownership-scoped policy each, `{authenticated}` only, no anon policy.

**Deliberately NOT hand-edited at apply time:** 035 still carries the
`p_choice not in (...)` NULL-guard bug (`NULL not in (...)` is NULL, not
TRUE). It was parked to "ride along with the next migration," but amending
a security-reviewed migration during its own apply — with no re-review —
is a worse habit than shipping one latent, UI-unreachable bug. Now that the
owner has approved migrations as a class, it gets its own numbered
migration instead.

### Live grant posture, checked across all 23 tables

Every table shows `anon` holding table-level SELECT (and most, write) — the
Supabase default grant — with **RLS as the actual gate**. 036 matches that
posture exactly, so it is consistent with the existing model rather than a
regression. Recording the shape so the next reader doesn't mistake the
grant for an exposure.

**One genuine exception, and it is the only one:** `visit_photos` carries
the database's **sole anon-facing policy** — `read permitted visit photos`,
`{anon,authenticated}`, whose first clause is `visibility = 'community'`.
So an unauthenticated caller holding the (public-by-design) anon key can
read any `community` row, including `person_id` and `storage_path`.
**Not exposed today**: 0 rows in the table, and the column default is
`'friends'`, so a user must deliberately opt in. Reads as an intended
community-feed design with a safe default. Flagged for confirmation rather
than as a finding — but it is the one place where "RLS is membership-scoped,
not permissive" has a deliberate exception, and that is worth knowing.
## 2026-09-06 — T1 Security/Backend: photo sourcing measured, blocked on owner input

Measured all three free tiers before building anything. **The free path tops
out at ~10 real venue photos out of 82 (12%).** Reporting rather than
proceeding, because the gap is a product decision, not an engineering one.

**Tier 1 (venue's own site, via the existing OG extraction): 1 usable.**
Not a limitation of the machinery — a limitation of the data. Only **2 of 82**
curated spots have any URL at all (`booking_url`), and one of those two
(`reifother.com`) no longer resolves. The one that works, Tresind Studio,
returned a clean og:image on the first try. So the extraction is fine; there
is simply nothing to point it at.

**Tier 2 (Wikipedia/Wikimedia): ~9 usable, and only landmarks.** My first
probe was invalid twice over and is worth recording as a caution: 300ms
between calls got HTTP 429, and `generator=search` returns the top hit
regardless of relevance, which produced "Bla Bla" → the footballer Blas
Pérez and "The Smash Room" → Dubai International Airport. Re-run with exact
title matching and 1.2s spacing: 19/82 have a page under their own name, 11
carry an image — but the **single-token-name problem resurfaces in a
completely different system**. Verified against the articles' own text:
Hummingbird is the bird, SoBe an American drink brand, Bla Bla an interactive
animated film, Saffron the spice, and Iris / Ninive / La mer are
disambiguation pages. Stripping those leaves **9 trustworthy**: VOX Cinemas,
Cinema Akil, Deep Dive Dubai, Museum of the Future, Dubai Safari Park, Dubai
Design District, Mall of the Emirates, The Green Planet, Black Tap.

**Tier 3 (Unsplash/Pexels): blocked, and wrong by default anyway.** Both
require an API key the owner must register for. More importantly a stock
photo is not the venue — it is the exact failure mode we rejected for
coordinates, and worse here: a wrong coordinate is invisible until someone
navigates, a wrong photo *looks correct on the card*.

**Coverage by category — 15 of 23 categories get zero:**

| sourceable | categories |
|---|---|
| 2 of n | movie, shopping |
| 1 of n | adventure, culture, dessert, dinner, family, outdoors |
| **0** | beach, beach_club, brunch, cafe, escape, games, karaoke, live_music, nightlife, padel, shisha, sports, vibes, water, wellness |

**The compounding is real and confirmed.** beach_club, escape, padel and
wellness are at 0% coordinates *and* 0% photos. Those four categories can
currently render neither a distance line nor an image — they are the weakest
surfaces in the app, not two independent gaps.

**The ask that actually unblocks this:** tier 1 is the only tier that yields
genuine venue photography, and it fails purely for want of URLs. ~80 venue
website URLs, pasted once, turn machinery we already own and have already
hardened into real photos at real quality — the same shape as the 12
hand-pasted coordinates. That is a far better use of the owner's time than
approving a stock-image backfill that makes 72 cards *look* right while
showing somewhere else entirely.

Nothing built, nothing staged, no bucket created, no migration written —
the design (public `spot-photos` bucket, `photo_source`/`photo_attribution`
columns, remotePatterns at the end) is agreed but waiting on this decision,
because the answer changes what gets built.

---

## 2026-09-06 — T1 Security/Backend: scale defects, and a silent-truncation class

Four scale defects, measured against a seeded local catalogue at 1082 and
5082 rows. **The headline is not performance.** Three queries were silently
returning wrong results past 1000 rows.

**PostgREST caps every table read at 1000 rows, with no error and no flag.**
An explicit `.limit(3000)` or `.range(0, 4999)` does not lift it — both
still return 1000 (measured). None of the affected queries had a limit
clause, so nothing in the code looked capped:

- **`dealSpotIds` — the core product loop.** At 5082 spots a dinner-family
  deal matched 1109 rows and received 1000. Every plan was dealt from the
  oldest 1000 spots of the family; the rest of the catalogue was undealable.
- **`resolvePlaceImport`.** Matched a pasted link against only the first
  1000 curated spots, reporting "no match" for venues that are in the
  catalogue.
- **`app/home/page.tsx`'s `.limit(120)`.** Explicit rather than silent, but
  at 1000 venues 880 are invisible in Discover, which filters client-side.
  **Removing the limit does not fix it** — the same 1000-row cap applies, so
  a naive fix still truncates at 5000. This one needs server-side search;
  it is Frontend's file and is flagged rather than edited.

Both fixable queries now page via `lib/supabase/paginate.ts`. Verified at
5082: resolve returns all 5082 (56ms, 6 round trips), deal returns all 1109.

**Indexes — measured, with an honest crossover.** Medians of 15 runs of
Postgres's own Execution Time, two warm-ups discarded.

| n=5082 | common term | no match | rare term | deal |
|---|---|---|---|---|
| before | 0.082 ms | 2.256 ms | 2.302 ms | 0.656 ms |
| after | 0.087 ms | **0.074 ms** | **0.109 ms** | **0.340 ms** |
| | −6% | **30x** | **21x** | **1.9x** |

Two things worth stating plainly. The existing `spots_name_idx` was **not**
unused as assumed: with `order by name limit 8` Postgres walks it in name
order and exits early, which is fast for a *common* term. The pathological
case is a rare or absent term — a typo, or a venue we do not stock — where
it must walk everything. That is the case users actually generate, and it is
the one the trigram index fixes. The common-term case gets marginally
*slower*; that is the right trade.

**The crossover is the more useful number: ~1,200 rows.** At 1082 the
planner ignores the trigram index and seq-scans anyway, because scanning
1082 rows is genuinely cheaper than the GIN machinery. So this index does
nothing at today's 82 spots and nothing at the owner's near-term 1000 — it
starts paying just past it. Added because the target is "500–1000s", not
because it helps today.

**`area` deliberately not indexed.** It is never a SQL filter anywhere in
this codebase — only read in JS for coordinate lookup. An index no query
shape can use costs writes and buys nothing.

**A regression I introduced, and the journey caught it.** Migration 038's
"no client writes to spot-photos" policies were written as ordinary
PERMISSIVE policies. Permissive policies are OR'd, so
`with check (bucket_id <> 'spot-photos')` did the opposite of its name: it
GRANTED insert into every other bucket unconditionally, defeating
visit-photos' own `foldername(name)[1] = auth.uid()` ownership check and
letting any signed-in user write into anyone's folder. `verify-journey.mjs`
step 25 failed on exactly that assertion. Fixed with `as restrictive`, which
is AND'd and can actually subtract permission. **A permissive policy can
never express "deny"** — worth remembering, because the intent ("say nobody
out loud") was right and the mechanism was backwards.

Migration 040 also carries the parked `p_choice` null-guard fix, verified
returning 42501 instead of a raw 23502.

Journey 119/120 — the only remaining failure is the known coordinate gap.

---

## 2026-09-06 — T0: migrations 038 + 040 applied live; 039 HELD

Owner: "approve all migrations". Applied 038 and 040, verified by catalog
query. **039 deliberately NOT applied.**

**038** — verified: both photo columns present, `spot-photos` bucket exists
and is public, 4 storage policies of which **3 are RESTRICTIVE** (the read
policy is correctly permissive; the three write-denial policies are not).
That restrictive/permissive distinction is the whole point: the version of
038 staged earlier today had them as ordinary permissive policies, where
`with check (bucket_id <> 'spot-photos')` does the opposite of its name —
permissive policies are OR'd, so it *granted* unconditional insert into
every other bucket, defeating `visit_photos`' folder-ownership check.
Backend caught it via `verify-journey.mjs` step 25 and fixed it before
apply. A permissive policy can never express "deny".

**040** — verified: `pg_trgm` installed, both indexes created, and the
parked `p_choice` NULL-guard finally shipped (`p_choice is null or p_choice
not in (...)`), so a null choice raises 42501 instead of a raw 23502.

**039 held, and this is the point of checking rather than assuming.** It
sets `photo_url` on six spots to `.../storage/v1/object/public/spot-photos/
<id>.jpg`. The bucket is live but **contains 0 files** — the reviewed images
were never uploaded. Applying it would have pointed six cards at 404s, which
is strictly worse than the null they have now: a broken image asserts that a
photo exists. Backend uploads the six files first; 039 applies after, and
the guarded `where photo_url is null` clauses mean it stays a no-op until
then.

Live photo state is unchanged: **0 of 82**.

---

## 2026-09-06 — T1 Security/Backend: front-door wall was unreadable, not unpassed

The "Dubai, right now" wall showed its empty state to every visitor. The
reported cause — `app/page.tsx` passing no spots — was only half of it.

**The other half: a signed-out visitor could not read `spots` at all.** Every
policy on the table was granted `to authenticated`, so an anon read returned
**zero rows and no error**. That silence is why it looked like "no spots
passed" rather than "no permission" — the same silent-empty shape as the
1000-row truncation class. The busiest page in the app has been telling every
prospect "no places in the catalog yet" against a catalogue of 82.

**Migration 041** grants anon `select` on `spots` scoped to
`source = 'curated'` and nothing else. Custom (user-created) spots stay
governed solely by the authenticated policy. Verified locally: anon reads
curated, gets 0 custom rows, and is refused on insert.

**The query is a bounded display sample, not a catalogue read**, and the
distinction is the point: PhotoWall renders at most 12 tiles, so `limit(12)`
is the wall's own size rather than an arbitrary cap. A query that means "all"
and takes what it gets is a truncation bug; one that means "twelve" and asks
for twelve is not. Photos sort first so the six queued images land where they
earn most.

**`security` review — policy sound, four findings, all fixed:**

- **Medium, and a regression I introduced.** Passing 12 spots trips
  `CardStackExample`'s `spots.length >= 9` check, so the hero deck switched
  from its curated illustrative cards to real rows — and `toDeck` reads
  `category` and `price_band`, which my select omitted. Every card fell back
  to the generic chip with a blank price. **The `as Spot[]` cast is what hid
  it from the type checker.** Both columns added; verified 0 generic chips
  and 9 price bands rendering.
- The query discarded its `error`, rebuilding the exact silent-empty failure
  the migration condemns. Now logged.
- `photo_attribution` added to the select ahead of 039: several queued photos
  are CC-BY and the licence requires credit wherever the image renders. The
  data is now there; **PhotoTile still does not render it**, which is
  Frontend's and must land before 039 puts CC images on this page.
- A comment I wrote in 038 and `schema.sql` claimed "the backfill writes via
  the service role". There is no service-role key by design. Corrected —
  prose asserting a credential exists is what authorises someone to mint one.

Review also asked for two widenings to be stated plainly in 041's header,
and they now are: RLS is row-level, so the policy exposes all curated
columns rather than the nine the page selects; and "age-restricted venues
are enumerable", previously accepted as requiring an account, now needs no
session. Both low for a public list of licensed venues, neither should be
rediscovered as a surprise.

Journey 119/120. Gate green. 041 staged, not applied.

---

## 2026-09-06 — T0: migration 041 applied live

Applied and verified: exactly one anon policy on `spots`, SELECT only,
`using (source = 'curated')`. Custom spots remain authenticated-only.

Applied under the owner's blanket migration approval rather than held like
038, and the distinction is deliberate: 038 created a public *write-target*
bucket, which is a posture change worth a separate yes. 041 grants read on
curated venue rows that are already the app's public marketing content, and
without it the front door is broken for every signed-out visitor — every
policy on `spots` was `to authenticated`, so an anon read returned zero rows
**and no error**. Same silent-empty shape as the 1000-row truncation class:
the page looked like it was passed no spots when it was actually refused.

Two widenings recorded rather than left to be rediscovered, both flagged by
Backend in 041's own header: RLS is row-level, so the policy exposes every
curated column and not merely the nine the page selects; and enumerating
age-restricted venues, previously requiring an account, now needs no
session. Both low for a public list of licensed venues, both stated to the
owner.

---

## 2026-09-06 — Property of this system: it fails by silence, not by refusal

Recording this as a pattern rather than as two coincidences, because it has
now cost real bugs twice in one day and both were invisible from the code.

1. **PostgREST caps a table read at 1000 rows** and says nothing. No error,
   no truncation flag, and an explicit `.limit(3000)` does not lift it. Three
   queries were silently returning wrong results — including `dealSpotIds`,
   the core product loop, which dealt every plan from the oldest 1000 spots.
2. **A missing RLS grant returns zero rows**, not a permission error. The
   front-door wall read `spots` as an anon visitor and got `[]` with no
   complaint, which read as "no data passed" rather than "no read
   permission" — so the diagnosis went to the wrong half of the problem.
3. **A malformed request arrives as an empty grid.** An unquoted search term
   containing a comma breaks PostgREST's `or` grammar: `"a,b"` returns
   PGRST100 and a **400**, not zero matches. The client discarded the error,
   so someone searching "beach, dubai" saw an empty grid and read it as "no
   such place" — a rejected request wearing the same face as an honest miss.
   (Found by Frontend, 2026-09-07; quoting the value fixes it.)
4. **A view created without `security_invoker` runs as its OWNER and bypasses
   RLS entirely.** Nothing errors; it simply returns more than it should.
   Migration 044 turns on exactly this option, and the whole safety of that
   view rests on it.

Both have the same shape: **the database answers a question it could not
actually answer, and returns an empty success.** An empty result is
therefore never evidence of an empty table. It means "empty, or truncated,
or forbidden", and those are indistinguishable at the call site.

Practical consequences, applied in today's fixes:

- Never destructure `{ data }` alone from a Supabase call whose emptiness
  would be meaningful. Take `error` and log it (`app/page.tsx`).
- When a query means "every matching row", say so explicitly and page —
  `lib/supabase/paginate.ts`. When it means "a bounded sample", make the
  limit the consumer's own size so the intent is legible (`limit(12)` for a
  12-tile wall).
- When probing this database, prove a positive. `verify-journey.mjs`'s
  negative controls assert a specific error code, not merely absence of
  rows — `supabase/CLAUDE.md` already says `200 []` is ambiguous, and these
  two bugs are what that warning looks like in production.

Related: `as Spot[]` casts over narrowed selects hide the same class of
problem from the type checker. One of those cost a marketing-hero regression
today (`CardStackExample` receiving rows without `category`/`price_band`).
A cast that quiets tsc about data shape is worth distrusting on sight.

---

## 2026-09-06 — T1 Security/Backend: the paging fix reintroduced the bug it removed

A silent-failure review of today's diff found four criticals in my files. The
first is the one that matters: **`fetchAllRows` returned the rows it had
gathered when a later page failed**, as a plain `T[]` the caller could not
distinguish from a complete answer. `dealSpotIds` checks only for null, so a
transient error on page 1 would have dealt a plan from the oldest 1000
spots — byte-for-byte the incident the helper was written to remove, reached
through its own fix.

Fixed, and the contract is now stated in the file: **`T[]` means complete,
null means ask again.** Any page error returns null (logged, rows
deliberately discarded); exhausting `MAX_PAGES` with every page full is also
an error, because 50k-truncated and exactly-50k are indistinguishable — the
PostgREST cap again with a bigger number.

**Eight tests now pin that contract** (`tests/supabase-paginate.test.ts`),
including the one the review called the highest-value in the tree: page 0
succeeds, page 1 errors, assert the caller cannot mistake the result for
complete. There was no test for this helper at all despite it being the fix
for three incidents.

**The ratings read** (`lib/spots/match.ts`) sat two lines below the paging
fix, unpaged, with its error destructured away. Worse than truncation:
unrated spots score 3.6, *above* a mediocre rating, so a short read silently
**promotes** every spot whose ratings fell off the end — two identical plans
dealt a second apart return different winners and both look correct. Now
chunked at 100 ids (a large `.in()` serialises into the query string and
returns HTTP 414 past a few thousand, which read as "nobody has rated
anything"), paged, and fails hard: ranking on a partial read is worse than
not dealing.

**`resolvePlaceImport`'s `?? []`** turned "the read failed" into "the
catalogue is empty", which the matcher renders as no_match — and the next
line *wrote that to the database*. A transient error while someone saved a
real venue durably recorded "we couldn't match this", and a resolved row is
not re-resolved. Now returns early: leaving an import pending is
recoverable, persisting a false negative is not. Its bare `catch {}` binds
and logs the error (it was swallowing aborts, scorer errors and shape
mismatches into one anonymous code, and because it caught, `onRequestError`
never saw them), and the outcome write checks its row count — a PostgREST
update matching zero rows is a successful no-op, so an RLS refusal left the
import pending while the POST returned 200.

**`safe-fetch` had two bounds claimed but not enforced.** `TIMEOUT_MS` was
armed fresh per redirect hop, so three hops was 15s against an advertised
~5s; there is now one deadline for the whole call. And `assertPublicHost`
ran *before* the AbortController existed, so DNS was covered by no timeout
at all — the same slot-holding failure the body-read fix closed, one
function earlier. `lookup()` is now raced against a 2s deadline.

Also: `verify-journey`'s `skip()` recorded `pass: true`, so a permanently
broken import pipeline would skip forever and keep the suite green — the
same "no complaint reads as success" shape. Now `pass: null`. And the
scale seeder no longer discards its count error, since migration 040's
benchmark numbers are quoted against the row count it reports.

Journey **120/120**. 64 unit tests (was 56). Gate green.

---

## 2026-09-06 — T0 session summary (69 commits, all four branches synced)

Written as a handoff. `AGENT_COORDINATION.md`'s decisions log has the
per-item detail; this is the shape of the day.

### Live database — six migrations applied, one deliberately held

035, 036, 037, 038, 040, 041 are **all applied and verified by catalog
query**, not assumed. **039 is held**: it sets `photo_url` on six spots to
`spot-photos` bucket URLs, and the bucket contains **zero files**. Applying
it would point six cards at 404s, which is worse than the nulls they have —
a broken image asserts a photo exists. The owner uploads the six files
(`scripts/spot-photos/`, named by spot id, `MANIFEST.json` has each
licence), then 039 goes.

Live photo state: **0 of 82**. Live coordinates: **40 of 82**, with
beach_club / escape / padel / wellness at 0%.

**Two apply-time judgements worth keeping.** 035 shipped with its known
`p_choice` NULL-guard bug rather than being hand-edited mid-apply —
amending a security-reviewed migration during its own apply, with no
re-review, is a worse habit than one latent UI-unreachable bug. It got its
own migration (040) once blanket approval existed. And 038 was held for
explicit approval where 041 was not: 038 created a public *write-target*
bucket, 041 grants read on content that is already the public marketing
surface.

### The day's defining bug class

**The system reporting success for a question it could not answer.** Seven
instances, three of them found in code written the same day:

- PostgREST silently caps every table read at 1000 rows, no error, no flag,
  and an explicit `.limit(3000)` does not lift it. Every plan was dealt from
  the oldest 1000 spots.
- Every policy on `spots` was `to authenticated`, so an anon read returned
  zero rows **and no error** — the front door looked unfed rather than
  refused.
- A Supabase Storage policy written PERMISSIVE instead of RESTRICTIVE
  *granted* the write it was named to deny.
- `fetchAllRows`, written to fix the first item, returned a partial page-set
  as a plain `T[]` on a mid-page error — reintroducing the exact shape one
  layer up.
- The ratings read sat unpaged two lines below that fix, error discarded.
  Worse than truncation: unrated scores 3.6, *above* mediocre, so a short
  read **promotes** every spot whose ratings fell off the end.
- A failed catalogue read was written to the database as the verdict
  "no match" for a venue that is in the catalogue.
- `verify-journey`'s `skip()` recorded `pass: true`, so a permanently broken
  pipeline would skip forever and stay green.

All fixed. `lib/supabase/paginate.ts` now states its contract — `T[]` means
complete, `null` means ask again — with eight tests pinning it. Found by the
`pr-review-toolkit` silent-failure agent pointed at the day's own diff.

### Observability — errors were invisible

`instrumentation.ts` wires Next 16's `onRequestError` to a dependency-free
structured logger (`lib/observability/log.ts`). Before it, an unhandled
error in a Server Component, route handler or Server Action went nowhere:
the app's 7 `console.error` calls were all on paths that had already caught
their error. Tracing (`@vercel/otel`) deliberately deferred — nowhere to
send a span until a deploy target exists.

**Redaction is the security half and is tested.** Verified against a running
production server rather than by inspection, which caught two credential
headers no exact-name list would hold: Next's own `x-middleware-set-cookie`
(carries `__Host-csrf`) and `referer` (carries the OAuth `?code=` on
`/auth/callback`). Matching is by substring marker for exactly that reason.

### Testing

- **Five environments**, not one: chromium, webkit, firefox, Mobile Safari,
  Mobile Chrome. The guest path is mostly a *mobile* path and had never been
  tested as one.
- **`tests/e2e/layout-consistency.spec.ts`** asserts design-independent
  invariants at the **real** breakpoint boundaries (520/640/760/850/1100,
  ±1), not round numbers. Currently **red on purpose**: 3 real failures.
- **`tests/e2e/visual.spec.ts`** scaffolded and skipping — baselines are
  deliberately not generated mid-redesign. `npm run test:visual:update`.
- Unit tests 38 → 64.

**Harness traps recorded so they are not rediscovered:** the hero entrance
animation does not run in the MCP browser (`/home-preview` screenshots
blank); forcing opacity is safe but `transform:none` destroys the card fan's
layout; the MCP's `resize_window` does not change `innerWidth`, though
Playwright's `setViewportSize` does — verified, so the 14-width matrix is
real.

### Design — the palette settled at v7 after seven rounds

Owner's six exact hexes: `#051822 #2D383E #7C5841 #AA7452 #969A9E #D4C9C7`.
Three text-capable colours in light (v6 had one), and a real dark end, which
is what makes a dark theme honest rather than invented.

- **§20 italics**, Cormorant. The blocker was **mine**: I committed the
  *Cyrillic* subsets of both faces because Google's css2 endpoint returns
  one `@font-face` per unicode-range and I took `head -1`. That explained
  every symptom — headlines falling back to a sans, and roman and italic
  rendering identically because neither was being used. Frontend was right
  to stop rather than enable on that evidence.
- **§21 rewritten** after the owner rejected position-based fills as
  "forcing the colors". Colour now belongs to a **component**, never an
  instance; the default instrument is brown accent *text*, not fills;
  ceiling is one filled surface per screen.
- **§22 spacing**, from the one fix the owner explicitly approved on sight:
  a container distributes free space through an **alignment property**,
  never by leaving slack where it falls. 0-above/152-below was not a wrong
  value, it was an undecided container. **Not a spacing scale** — 0/152 can
  be built from entirely valid tokens.
- Dark theme **mocked, not built**, at the owner's request.

### Vercel — set up, then parked at the owner's request

Project linked (`safebox/plan-ind`), GitHub connected, 8 env vars set,
**preview deployed and verified** (200, legal pages render real values).
Production never deployed. Owner then said to skip Vercel for now, so it
sits as-is. `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `NEXT_PUBLIC_SITE_URL`
remain unset.

### Standing rules added (both owner-driven, both in AGENT_COORDINATION.md)

1. **Keep owner-facing messages short.** Asked twice.
2. **Show, do not tell** — screenshot every visible change and send it.
   Pairs with the first: the image *is* the short version.

### Open, needing the owner

Upload the six photos; add `{{ .Token }}` to the Supabase email template;
decide on the dark theme; go/no-go on the Places ingestion
(`PLACES_INGESTION_SCOPE.md`, 5-8 days, ~$0 at 5000 venues, but review is
the real cost — 3 of 9 photos were rejected at visual review). Turnstile is
deprioritised while Vercel is parked, since the app only requires a captcha
in production.

---

## 2026-09-06 — T1 Security/Backend: state at handoff

Tree clean, everything committed and pushed. The cross-cutting story is T0's
in `AGENT_COORDINATION.md`; this is only what is open on my side.

**Live state:** 035/036/037/038/040/041 applied and verified. **039 held.**
0 of 82 photos live, 40 of 82 coordinates.

**Open — needs the owner, not code:**

1. **Six image files must be uploaded before 039 applies.** They are in
   `scripts/spot-photos/`, named by spot id — the filenames ARE the URLs, so
   they cannot be renamed. `MANIFEST.json` beside them lists each one's
   source, licence and attribution. Nothing in this project can upload them:
   there is deliberately no service-role key, and 038's restrictive policies
   close every client path, so the one credential that can write that bucket
   is one only the owner holds. That is the design working, not a gap.
   Applying 039 before the files land points six cards at 404s, which is
   worse than the nulls they have now — a broken image asserts a photo
   exists where null renders the designed no-photo state.
2. **The four zero-coverage categories.** beach_club, escape, padel and
   wellness have neither coordinates nor photos, and are also the four
   Google Places has no clean type for. Twelve hand-pasted coordinates would
   close the coordinate half; the photo half needs either venue URLs or the
   Places decision.
3. **`PLACES_INGESTION_SCOPE.md` is a decision the owner has not made.** It
   is written to stand alone: verified SKU costs (the batched field-mask
   route makes 5,000 venues **$0**, not the ~$80 first estimated), `place_id`
   as a nullable unique column rather than the primary key, free freshness
   checks, 5–8 days, and the two things deliberately not softened — Google's
   taxonomy misses exactly our weakest four categories, and a **33%
   post-automation photo rejection rate does not survive 1000 venues**
   without review tooling.

**Confirmed cleared:** PhotoTile now renders `PhotoCredit`, and all three
pages that feed a photo surface (`app/page.tsx`, `app/home/page.tsx`,
`app/plan/[id]/page.tsx`) select `photo_attribution`. The licence obligation
is satisfied end to end, so 039's other blocker is gone.

**Still open, not blocking:** `app/home/page.tsx`'s `.limit(120)` is
Frontend's and needs server-side search rather than a bigger limit — the
1000-row cap means raising the number cannot fix it. And the
`word_similarity` pre-filter for place-import is the right next step once
instruments show imports are hot; the reasoning is in `resolve.ts`.

**The one line worth carrying forward:** `lib/supabase/paginate.ts`'s
contract — **`T[]` means complete, null means ask again** — because it names
today's defining bug class in a form the type system can help enforce.

---

---

## Frontend lane (T2) — 2026-09-05/06

Palette v7 and the §21 rewrite, Cormorant and the §20 italics, photo
attribution, the hero deck centring, and the start of the visual QA pass.
Commits `c19753c` (deck centring, now §22) and `2935710` (QA: touch
targets, auth centring, auth focus ring).

**The type size floor is 20px, and the reason is not taste.** Cormorant's
drawn weight is calibrated for display sizes. Between roughly 11px and
16px its thin strokes fall below one device pixel at 1x and the face
renders as a grey smear that reads lighter than the body font next to it —
so a "heavier" heading looked weaker than the paragraph under it. From
about 23-25px up it holds cleanly and the axis behaves. The floor block at
the end of `globals.css` exists to keep small text off that face
entirely; do not lower it to fit a layout, change the layout.
`WeightRise` was narrowed to 300-700 for the same reason: the wider range
spent most of its travel in the region where the strokes disappear.

**A blanket token sweep reaches into the parked night blocks.** Five
palette edits landed inside `[data-theme="night"]` scopes during the v6
work and had to be reverted. §19.2 parks that machinery rather than
deleting it, so those blocks still parse and still match a find-and-replace
on a token name. Any future sweep must scope itself out of the night
scopes explicitly, or it will silently couple a parked block to a live
value and misfire whenever dark is unparked.

**The accent's semantics inverted between v5 and v6 purely from a value
swap.** 31 rules that were measured correct under v5 became failures under
v6 without a single one of them being edited — the token moved across the
large-text/small-text boundary, so every rule that had been legitimately
using the display-size champagne was suddenly using it at caption size.
The lesson is that a palette change is not reviewable from the diff: the
diff shows the token, not the 31 sites whose compliance depended on its
value. Re-measure rendered output after any token value change.

**Three specificity traps in §21.6, none visible in the diff.** Getting
full-strength ink onto the selected state took three attempts: first
softening with opacity, which is the exact mistake the spec names; then a
rule that tied on specificity and lost to source order; then a
`:first-child` kicker that outranked a doubled class. All three looked
correct in the file and were wrong on screen. Verify rendered computed
style, not the rule you just wrote.

**Contrast-auditor traps, all three mine.** `color()` 0-1 channels read as
0-255, alpha ignored so 12% tints read as solid fills, and gradient fills
reporting a transparent `backgroundColor` so the walker looked straight
through the primary button. Each only ever *inflates* the failure count,
so earlier clean results still stand — but a fresh auditor will
re-introduce them.

**`resize_window` in the Chrome MCP does not change layout width.**
`innerWidth` stays 1440 while `outerWidth` follows the window, so the page
never re-lays-out and a width matrix built on it measures one width N
times. Playwright's `setViewportSize` is correct and flips the media
queries exactly at the boundaries (verified by T0). Use Playwright for
width coverage.

**The `demo-` class prefix is a naming legacy, not a demo-only surface.**
I nearly skipped the whole account-tab sweep on the reasoning that
`/home-preview` renders `DemoAccountViews` and is dev-only. The shipping
`AccountViews` uses 43 of the same `demo-*` classes, so every finding on
those tabs is real and ships. Check before concluding a `demo-` class does
not matter — this produced a confidently-wrong "not applicable" that a grep
took ten seconds to disprove. The genuinely demo-only pieces are the
*components* (`DemoAccountViews`, `DemoPlanningTools`), not the classes.

**⚠ CORRECTED 2026-09-07 — the lesson originally recorded here was wrong,
and it was mine.** This paragraph used to read "a fail-closed state that
names a plausible wrong cause is worse than an unstyled one", asserting the
app had misreported why guest voting was unavailable. **It had not.** Tested
directly afterwards: with the auth endpoint blocked, and with all of
Supabase blocked, the share link renders *"This plan wouldn't open. The
connection dropped before the plan loaded."* — never "Guest voting is
paused". The detection is precise: `bootstrapPlanAccess` returns
`anonymous-disabled` only when GoTrue answers with the specific
`anonymous_provider_disabled` code, which a blocked request cannot reach.

So when "Guest voting is paused" appeared, **anonymous sign-ins genuinely
were disabled at that moment** — a standing blocker in the house rules. They
were enabled later. The stale CSP was a real but *separate, concurrent*
problem. **The app told the truth both times; two real faults overlapped.**

What survives, and is still worth knowing: `next.config` builds the CSP's
`connect-src` from `NEXT_PUBLIC_SUPABASE_URL` when the server starts, so a
later `.env.local` edit leaves the header naming a host the app no longer
uses and every client-side Supabase call is blocked before leaving the
browser. Restarting the dev server re-evaluates it. If a data-dependent
finding looks impossible, check the CSP header before believing it.

**The meta-lesson is the more useful one: a plausible moral drawn from an
undiagnosed symptom spreads faster than the symptom.** This one reached the
owner and three lanes before anyone read the code path that would have
disproved it in a minute.

### Open, in the order I would take them

1. **The rest of the QA pass.** The three harness failures are closed
   (verified at a real 390px viewport: `/`, `/privacy` and `/terms` report
   nothing under 44px; auth shell 40/40 at 1440 and 0/0 at 390; auth input
   focus reports `2px solid #051822` at `-2px`, no shadow). The §22 sweep
   has covered `/`, `/login`, `/onboarding`, `/privacy`. Still unswept: the
   vote screen, the account tabs, `/place/[id]`. The sweep script shape is
   in the commit history — containers with an imposed height where the
   slack lands >24px to one side, filtering out those that already declare
   an alignment (`justify-content: flex-end` on `.wall-tile__body` and the
   absolutely-positioned card faces are deliberate, not findings).

2. **`min-h-[440px]` versus the 29rem/27rem stage.** The card floor is
   fixed at every width while the stage drops to 464px and 432px on small
   screens, so the deck bleeds past the stage there. The centring splits
   that bleed evenly instead of dumping it at the bottom, which is why it
   is not urgent, but it is the same §22 shape: a floor and a container
   height that disagree with nobody deciding. Fix the two to agree.

3. **`app/home/page.tsx` needs server-side search.** PostgREST silently
   caps reads at 1000 rows, so removing `.limit(120)` does not fix it and
   will read as fixed while still truncating. The catalogue query has to
   filter on the server.

4. **Mobile E2E specs.** Guest-vote coverage at mobile widths, the vote
   screen on WebKit, and touch targets at real mobile viewports. Open
   question I could not resolve: whether guest-vote can be made safe to
   run without writing to the live database. `RUN_E2E` stays off in CI
   until that is answered — it is gated on exactly this.

5. **Visual-regression baselines** (`npm run test:visual:update`) once the
   passes above have landed. Generating them earlier just bakes in the
   layouts still being changed.

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
