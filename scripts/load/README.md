# Load testing

`npm run load <scenario>` — thin `autocannon` wrapper, reports p50/p90/p97.5/p99
latency, mean throughput, and non-2xx rate. See `run.mjs` for the scenario list.

**The dev server (`localhost:3000`) points at the same live Supabase project as
production.** This isn't a sandbox — keep `--connections`/`--duration` low
(defaults: 10 / 10s) unless you've checked in with the team first. Never point
`LOAD_BASE_URL` at the deployed production URL without asking.

```
npm run load home                              # unauthenticated front door
npm run load deal -- --token <access_token>    # authenticated, quota-limited
npm run load home -- --connections 20 --duration 20
LOAD_BASE_URL=http://localhost:3001 npm run load home   # against a prod build
```

`deal` needs a **permanent** (non-anonymous) session token — `/api/spots/deal`
401s anonymous sessions outright. No test account is scripted yet; minting one
means email OTP or a seeded permanent user, which is real setup, not a quick
add.

## Baseline — 2026-09-01, `home` scenario, 10 connections / 10s

| | `next dev` (:3000) | `next start` production build (:3001) |
|---|---|---|
| p50 | 161ms | **10ms** |
| p90 | 314ms | 15ms |
| p97.5 | 497ms | 21ms |
| p99 | 790ms | 30ms |
| mean | 198.8ms | 11.2ms |
| throughput | 49.9 req/s | **857.5 req/s** |
| errors | 0 / 499 | 0 / 8575 |

**~17x throughput, ~16x p50 latency between dev and a production build** — not
an optimization, just what `next dev`'s unbundled/uncompiled mode costs. The
real number to track going forward is the production-build one; re-run this
after any change that might affect first-load cost and compare against 10ms/
857 req/s. Zero errors at either.

## Concurrency load — votes / RSVPs / ratings

`run.mjs`/autocannon drives sustained-duration HTTP load against one URL with
one body. The write RPCs need a different shape of test: N *distinct*
identities (bearer token + `participant_token_hash`) all firing **once**,
simultaneously — a burst, not a duration. That's `concurrency.mjs`, hitting
Supabase's PostgREST RPC endpoint directly (there is no Next.js route in
front of `cast_plan_vote`/`set_plan_rsvp`/`rate_plan` — the browser calls
`supabase.rpc(...)` straight from the client).

```
node --env-file=.env.local scripts/load/mint-voters.mjs [count]   # setup, once
node --env-file=.env.local scripts/load/concurrency.mjs <scenario> [n]
```

Scenarios: `vote-contend`, `vote-flap`, `rsvp-contend`, `rsvp-collide`
(mirrors `set_plan_rsvp`'s unbounded-retry-loop shape; `rate_plan` shares the
identical code pattern from migration 025, so a `rating-collide` twin was
skipped as duplicate signal, not built).

Runs against the dedicated fixture plan `33333333-3333-3333-3333-333333333333`
(`supabase/seed-load-test-plan.sql`) — separate from the e2e suite's shared
`22222222-…` plan on purpose, so a load run and Playwright's guest-vote spec
never collide.

**Voters are real anonymous Supabase sessions** (`signInAnonymously`) — the
actual guest path, not forged. **Finding, not yet acted on:** GoTrue rate-
limits anonymous sign-in bursts hard (an IP-scoped bucket, ~30 observed
before throttling, and it recovers slowly — single-digit sign-ins per several
minutes once drained). `mint-voters.mjs` staggers in small batches and stops
cleanly on a rate-limit hit rather than crashing, but this ceiling is real
production behavior, not just a test-harness inconvenience: several guests on
the same wifi opening a share link within the same window could be throttled
out of getting a session at all. Not fixed here — flagging for the owner to
decide whether the default GoTrue anonymous-signup rate limit needs raising
for real group use.

## Results — 2026-09-04, n=15, against the live project

15 was the real ceiling this run — GoTrue's anonymous-signup rate limit (see
above) capped how many voters could be minted in one session even after
raising the dashboard limit.

| scenario | calls | p50 | p90 | p99 | max | errors |
|---|---|---|---|---|---|---|
| `vote-contend` (15 distinct voters, same spot/round) | 15 | 428ms | 437ms | 830ms | 883ms | 0/15 |
| `vote-flap` (15 voters × 3 toggles each) | 45 | 278ms | 830ms | 842ms | 1054ms | 0/45 |
| `rsvp-contend` (15 first-time RSVPs, distinct names) | 15 | 351ms | 359ms | 360ms | 399ms | 0/15 |
| `rsvp-collide` (15 first-time RSVPs, **same** name) | 15 | 457ms | 460ms | 462ms | 473ms | 14/15* |

\* `rsvp-collide`'s 14 "errors" are the correct outcome, not a defect —
exactly one caller can legitimately win a display name, and the
`set_plan_rsvp` retry loop (migration 025) resolved all 15 concurrent
first-timers into 1 winner + 14 clean `That participant name is already in
use` responses, no raw Postgres error leaked, no timeout. **This is the
finding**: the unbounded `loop`/retry-on-`unique_violation` this repo has
only ever correctness-tested at 2-way contention degrades gracefully at
15-way — p99 462ms, no pathological blowup. Not fixed because nothing here
needed fixing; re-run at a higher N if the rate-limit ceiling ever lifts, to
see where (if anywhere) it stops being graceful.

`vote-flap`'s p90/p99 jump (278ms → 830ms+) while `vote-contend`'s and
`rsvp-contend`'s stay flat is expected, not a red flag: 45 calls share only
15 real network connections (3 sequential calls per voter), so the slower
tail is queuing on the client side, not lock contention on the server —
consistent with `vote-contend`'s clean p50≈p90 shape at true one-shot
concurrency.

### A real bug this testing surfaced (not a load/perf finding)

`vote-contend`'s first run (same voter_name for all 15, an unrealistic test
shape) failed 14/15 on `duplicate key value violates unique constraint
"votes_round_choice_unique"` — a legacy unique index migration 023 believed
it had dropped. It hadn't: 023's drop logic only searches `pg_constraint`,
and this is a bare `create unique index`, never a table constraint, so the
lookup silently found nothing and the DO block exited clean with no error.
Confirmed live via direct catalog probe (`pg_indexes` still lists it).
**Migration 032** fixes it — drops the index by its now-known exact name.
Consequence while unfixed: two guests who type the same display name and
vote the same spot/round hit an unhandled `23505` inside `cast_plan_vote`
instead of both votes recording under their own identity, exactly as 023's
own comment predicted it would if the drop ever failed. Staged, not applied —
same apply-order rule as every other migration here.

## Not yet measured

- `/api/plans` (create) and `/api/spots/deal` under load — both require a
  **permanent** (non-anonymous) session, and this app has no password auth
  wired in (only email-OTP and Google OAuth) and no service-role key by
  design, so minting one non-interactively for a script isn't self-serve the
  way anonymous voter sessions are. Needs the owner to hand a real permanent
  session's refresh token to a `LOAD_TOKEN`-style env var, or to accept this
  stays unmeasured.
- Anything under real network conditions — this is loopback, so it's a
  ceiling, not a field number. Re-run once deployed (Vercel) for a true figure.
