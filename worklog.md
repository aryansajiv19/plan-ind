# Deal three worklog

Last updated: 2026-09-18 (Asia/Dubai). Entries from 2026-09-07 and earlier are in `worklog-archive.md`.

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

---

## 2026-09-17 — T1: C5 edit a plan before voting, migration 055 STAGED + route `edit` command

`edit_plan(p_plan_id, p_host_token, p_title?, p_deadline?)` → result codes
`edited | nothing_to_change | not_found | not_host | voting_started |
invalid_title | invalid_deadline`. Auth = delete_plan's (creator AND host token,
not anonymous, `for update`). Voting started = status not open OR stage not pool
OR any vote. Title/deadline validated exactly like creation. A new RPC, not an
`execute_plan_command` branch (that one raises instead of returning codes, and it
is the core voting function). Accepted race (a first vote landing after the
no-votes check) is documented in the header.

Route: `POST /api/plans/[id]/command {command:"edit", hostToken, title?, deadline?}`.
delete and edit share one result-code branch; `nothing_to_change` → 200,
404/403/409/422 for refusals, 500 on error or unknown. Deadline must be a strict
ISO-8601 instant with `Z` or `±HH:MM` (review L1: `Date.parse` accepted "2026"
and "UTC+4", which Postgres rejects or reads 8h apart).

Verified 23/23 on the live-identical rig + 052 + 054 via PostgREST (negative
control, every refusal including a member holding the host token, the
voting-started states, validation, grants, re-run). `security` review: no C/H/M,
delete's behaviour unchanged by the refactor. Not exercised through a running
Next server. Frontend note (review L2): the edit response has no `plan` key, so
it must not go through `runHostCommand`, which treats a missing plan as failure.

---

## 2026-09-17 — T1: C6 leave a plan, migration 056 STAGED; lock proposal corrected

`leave_plan(p_plan_id)` → `left | not_member | host_cannot_leave | not_found`.
Host refused (deletes instead). Open plan: the leaver's votes, RSVP, access go
(tally drop intended). Decided plan: votes kept (the tally never contradicts the
winner); RSVP, rating, access go. Rejoin via the same link starts fresh. Guests
can leave. `for update` on the plans row serialises with advance/decide.

Verified 21/21 on the live-identical rig + 052/054/055 via PostgREST, including a
deterministic reproduction of the leaver's-own-vote race: with leave holding the
plans lock, the vote passes the membership trigger, waits at its FK, and commits
after the leave → **1 counted vote from a non-member**. Accepted and documented
(self-inflicted, bounded). `security` review: no C/H.

**Correction to my own proposal:** I proposed closing the race with the
membership trigger taking the plans key-share lock (it worked on the rig for the
INSERT race). The review showed it **deadlocks on the upsert/update path** (child
row locked first, then plans) against `delete_plan`/`leave_plan` (plans first,
then child rows). The right fix is `for key share` on the plans read that
`cast_plan_vote`/`set_plan_rsvp`/`rate_plan` already do (plans always locked
first). It also closes a pre-existing race where a vote passes the stage check
just before advance/decide. **Folded into the 053 scope** (same three functions).
Needs a rig check of a concurrent re-cast vs delete_plan/leave_plan.

Open product call: after a leave, `plans.booking_owner` may still name the
leaver, and a driver's seats vanish from the carpool list.
- 056 amended before apply (T0): leaving clears `booking_owner` when it matches the
  leaver's RSVP name AND `booked` is not true; a real booking keeps its owner.
  Rig 24/24 (unbooked cleared, booked kept, non-owner untouched). Review Low
  accepted: name-match squat can blank an unbooked booker's name (visible, host
  can re-set, never touches a booking).

---

## 2026-09-17 — T1: C7 reopen a decided plan, migration 057 STAGED + route `reopen`

`reopen_plan(p_plan_id, p_host_token, p_deadline?)` → `reopened | not_found |
not_host | not_decided | no_rounds | booked | already_happened |
invalid_deadline`. Creator AND host token. Back to the FINAL round (status open,
stage final, winner null); finalists, final votes, RSVPs/carpool, booking_owner,
event_time kept. Deadline cleared unless a new valid one is given (a past
deadline would auto-re-decide). Refused when booked, when any rating or logged
visit points at the plan, or when fewer than 2 finalists are advanced. Audit row
on success. Route: `command: "reopen"`.

Security review found a real **Medium**: someone who left a decided plan keeps
their final vote (056 keeps votes on decided plans), so after a reopen that vote
would still help pick the new winner. **Fixed:** reopen removes final votes whose
voter has no plan_access (legacy null-user votes stay). Also adopted: visits
block reopen like ratings; `no_rounds` counts advanced spots only (a legacy plan
with 1 advanced of 3 was reopenable into a one-candidate final).

Verified 29/29 on the live-identical rig + 052/054–056 via PostgREST, including
the full loop: reopen → member switches vote → host decides → the new finalist
wins. The rating race is the accepted class (closed by 053).

Deadline readers checked for NULL: `closesLabel` → "Open", the host auto-decide
effect returns early, `edit_plan`'s comparison is null-safe, the create form
always sets one, no share copy uses it.

---

## 2026-09-17 — T1: runbook "Next" rehearsed once from live state (82/82); plan creation accepts invisible titles (live)

APPLY_RUNBOOK.md now has preflight rows for 052/054–057, a "Next" table
(N1–N8: 052 → 054 → 055 → 056 → 057 → deploy → 049 → 051) with pasteable verify
lines, and §4b recording the rehearsal. Proven: all five are additive for the
current client (its reads still work with them applied) and prerequisites for
the new one. The old sign-up path (`p_emoji: "?"`) yields JSON `null` and no client
renders `people.emoji`.

Two harness traps this round, both caught before trusting a result:
- `check054` counted ALL people ("15") when run after other suites. Scoped to its
  own ids.
- My first creation probe "showed nothing" because both calls failed input
  validation (wrong field; not enough spots) before reaching the title check.
  A positive control (a normal title must succeed) exposed it; the valid probe
  then confirmed the gap.

**055 fixed in place (7e618e7):** `edit_plan` refused `''` but saved an
invisible-only title (T2 found U+200B). It now also requires the title to be
non-empty under `clean_display_name` (the same invisible set, ZWJ/ZWNJ inside
words kept). T2 verified end to end.

**OPEN, LIVE, pre-existing:** `create_direct_plan` and `create_secure_plan`
accept invisible-only titles (stored U+200B and U+200B+ZWJ). Not patched: needs
its own reviewed migration and an owner go.

---

## 2026-09-17 — T1: migration 058 STAGED — plan creation refuses invisible-only titles (Low)

`create_secure_plan` / `create_direct_plan` (live) stored a title of only U+200B
(or U+200B+ZWJ). 058 re-creates both verbatim from the checksum-proven live
bodies, changing ONLY the title condition to also require a non-empty title
under `clean_display_name`. Same 22023 error the client already handles; grants
kept; stored title unchanged (`clean_app_text`, 60). Needs 052 first.
Rehearsed incrementally on the 052–057 rig, 16/16: negative control first; then
ZWSP / ZWSP+ZWJ / BOM+NBSP refused on both functions; positive controls: normal
and Persian-with-ZWNJ titles still create; grants unchanged. `security` review:
bodies byte-identical apart from the condition, emoji-only titles unaffected, no
findings. Runbook: preflight row + N5b (pre-deploy, additive for the current client).

---

## 2026-09-17 — T1: C4 migration 059 STAGED — birthday correction (direction rule) + one age-gate source

- **One source for gates:** `category_age_gates()` (immutable VALUES list),
  `category_min_age()`, `spot_required_age()`; the two creation functions'
  three hardcoded CASE copies are replaced (re-created from 058's bodies). Full
  age matrix at creation (ages 16/18/20/21 × dinner/shisha/nightlife × both
  functions) identical before/after. A function, not a table (T0): values change
  only by migration.
- **`correct_birth_date`:** one correction (`member_ages.corrected_at`).
  DIRECTION rule (T0's correction to my band rule, which let 17.0→17.99 unlock
  18 the next day): younger always allowed (≥13); older only if already past the
  highest gate = greatest(max category gate, max `minimum_age` of CURATED spots;
  live max 21, values 0/18/21; custom spots excluded so a junk 99 can't block
  everyone). Otherwise `crosses_age_gate` → contact support (manual, outside the app).
- Security review adopted: **time zone.** `current_date` followed the session
  zone, which a PostgREST caller sets per request (`Prefer: timezone=`).
  **Verified on the rig before acting:** the header moved the date. The three
  gate functions now pin `Asia/Dubai`; the rig negative control (a user turning
  21 today in Dubai was refused under GMT+12) passes after. **Refused crossings
  are audited** (outcome blocked, no dates). Helpers revoked from anon/authenticated.
- **Pre-existing, not widened:** `set_birth_date` and `current_member_age` still
  use the session zone (same up-to-a-day skew; the plan-creation gate itself is
  now pinned).
- Verified 47/47 on the 052–058 rig; schema.sql builds from scratch with 059.

---

## 2026-09-17 — T1: 057 adds `plans.reopened_at` (STAGED); 049/051 now single-transaction

- `reopen_plan` sets `reopened_at = now()`. Notice rule for clients: status
  `'open'` AND `reopened_at` set. `execute_plan_command` untouched: a re-decide
  flips status to decided (notice hides), value kept as history. T0 accepted.
- 051's plans grant lists `reopened_at`, so **051 must apply after 057** (runbook
  N8 dependency + verify line; N5 verify checks the column).
- `security` review (lane/backend @ 0d50238 + diff): no Critical/High/Medium.
  Low adopted: 049/051 revoke-then-grant was only atomic in the SQL editor; both
  now `begin; … commit;`. Proven on the rig: 051 run via plain `psql -f` without
  057 errors and leaves `plans` SELECT intact; in order, grants correct.
- Rig: 057 suite 34/34 (reopen sets it; re-decide → decided/kept/notice false;
  never-decided plan patched with event_time/booking_owner → null; 051 after 057
  → member reads reopened_at, created_by_user_id still refused).
- 059: runbook N5c now requires `max(minimum_age)` of curated spots = 21 on live
  before apply (not re-read today: a live read was not permitted from this session).

---

## 2026-09-18 — T1: C3 migration 060 STAGED and PROVEN — delete my account

- **Shape (owner's calls):** storage first, confirmed by listing; one RPC
  transaction ending in `delete from auth.users`; hosted OPEN plans deleted,
  hosted DECIDED plans with another member kept read-only (creator null, host
  token row deleted); custom spots kept ownerless (FK → `set null`, the CHECK
  replaced by an INSERT-only trigger) so a shared spot no longer cascades away
  other people's votes and visits, which also removes the `winner_spot_id`
  blocker; audit row with counts only.
- **Votes/RSVPs/ratings are handled BEFORE the auth delete.** Their FK is
  `on delete set null`, so a bare auth delete would mint rows with a name and a
  participant_token_hash and no user_id — 053's claimable class. Open-plan votes
  deleted, decided-plan votes kept as 'Former member' with hash and user_id
  null, RSVPs and ratings deleted. Asserted: no new claimable rows.
- **Security review, HIGH (fixed): the old order could destroy photos for
  nothing.** Photos were deleted first; if the definer cannot remove the
  `auth.users` row the RPC rolls back, but the photos are already gone. And
  `auth.users` has RLS with no policies, so a missing privilege **removes 0 rows
  without raising** — `deleted` would have been reported for a login that still
  worked. Fixes: a probe (`p_probe`) that does the real delete inside a block,
  checks the row count and raises to roll it back, called by the route BEFORE
  any photo is touched; plus `row_count = 1` asserted on the real path.
- **Review MEDIUM (fixed):** `booking_owner` matched every name the user had
  ever used anywhere — one Sara deleting her account would wipe another Sara's
  name from shared plans, and a throwaway plan could be used to wipe someone
  else's deliberately. Now correlated per plan, and `booked is true` is left
  alone as in leave_plan. MEDIUM-LOW (fixed): the leftover-photo count keyed on
  `owner_id` while the upload policy keys on the path, so a null-owner object
  under the user's folder was invisible to the proof; now counted by either.
  The route's listing was capped at one level and 1000 entries; it paginates and
  recurses with a depth guard that throws rather than missing files. LOW: my
  "cannot deadlock" claim was wrong (hosted plans locked, then votes written in
  plans I do not host — the opposite order to delete_plan); every plans row the
  function touches is now locked in id order. `app_rate_limits` rows keyed on the
  raw uid are deleted.
- **Proof:** rig == live (7/7) then 052..059; check060 **37/37**, check060-storage
  **11/11** against a real storage-api container. Controls, not just assertions:
  auth delete raising → nothing deleted; auth delete removing 0 rows silently →
  `cannot_delete_login`; before 060 an orphaned upload is invisible to its owner
  and its delete returns `200 []`. Suites: `~/plan-ind-rehearsal-backup/rehearsal/`.

## 2026-09-18 — T1: a sentinel must be distinguishable from the failures it detects

`delete_my_account`'s probe deletes the login for real, then raises to roll that
back. It signalled with a plain `raise exception`, which is **SQLSTATE P0001 —
the same code any ordinary trigger raise produces**. The rig's rollback control
(a BEFORE DELETE trigger on auth.users that raises) was therefore caught by the
probe's own handler and reported as `ready`: the mechanism built to detect a
failed login delete was swallowing exactly that failure. Fixed with a private
SQLSTATE (`PT060`); anything else propagates.
Found by the control, not by reading the code — same lesson as the Realtime
"any refusal passes" check and the zsh gate that false-passed.

## 2026-09-18 — T1: storage.protect_delete() blocks SQL deletes on storage.objects

Reproduced on the rig against a real storage-api (v1.70.3), not claimed: a plain
`delete from storage.objects` raises *"Direct deletion from storage tables is not
allowed. Use the Storage API instead."* **No migration can ever clean up storage
objects in SQL.** Deleting a file means the Storage API with a session that
passes the bucket's delete policy. 060 is unaffected — the route deletes through
the API and the RPC only counts — and the rig's fixture cleanup only works
because `session_replication_role = replica` disables the trigger.

---

## 2026-09-18 — T1: the 053 hijack path is CLOSED by deleting the data, not by guarding it

Owner-approved live write, run by T0. All 45 legacy rows (25 votes, 17 RSVPs,
3 ratings — every one `user_id is null`, on the 6 fixture plans) deleted;
verified 0/0/0 after, `plans` 6 and `spots` 82 untouched. Those three tables
were legacy-only, so nothing owned was lost, and live had 0 permanent accounts.
Every row written since 043 carries a `user_id`, so there is nothing left to
claim by `participant_token_hash`.
**The judgement worth keeping: deleting the data beat guarding it.** The planned
fix was migration 053 — rewriting the three core voting RPCs, with its own
rehearsal, while T2 was re-walking that loop. One statement over the owner's own
test data removed the exposure completely instead of adding a guard around it.
Ask what the data is before writing code to protect it.
What remains of 053 is only the `for key share` race fix (the accepted races
documented in 056 and 057): correctness, queued, not a launch blocker.
Side effect recorded in the runbook §7 so nobody reads it as a regression: the
six fixture plans now render with no votes.

## 2026-09-18 — T1: photo pre-apply gate (1c1ced3), proven both ways

`scripts/check-spot-photo-urls.sh <migration.sql>` curls every `spot-photos` URL
in a migration and prints ok/BLOCK. **It asserts the content type, not just the
status:** a missing object in a public Supabase bucket answers 400 with a JSON
body, and "it responded" is not the question. Proven against live both ways —
039's six return `image/jpeg` (ok), a fabricated key returns 400 (BLOCK, exit 1).
No key needed; the bucket is public. This is the check 039 was originally held
for. It also confirms live's object keys are hyphen-stripped, which is why 046
must be written against the keys that actually land, never the filenames sent.
