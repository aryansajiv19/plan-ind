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
| 026 | `migration-026-otp-rate-limit.sql` | yes — applied live. |
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
