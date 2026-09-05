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

## Scale testing — local Supabase stack (thousands of concurrent users)

The live-project rate limit above caps real scale testing at n≈15-30. For
"does this hold at real scale," the fix is a different target, not a bigger
rate limit: a **local Supabase stack** (`npx supabase start`, Docker) has no
rate limit at all, and its own well-known local `service_role` key mints
**permanent** test accounts in bulk — closing the other standing gap too
(`/api/plans`/`/api/spots/deal` need a permanent session; there's no
self-serve way to get one against the live project).

```
npx supabase init && npx supabase start          # once
psql <local db url> -f supabase/schema.sql       # once, fresh DB only
# seed app_control_secrets (see SECURITY_SETUP.md), then:
node --env-file=.env.local scripts/load/seed-local-stack.mjs [planCount]   # copies the real curated catalog + seeds plans
node --env-file=.env.local scripts/load/mint-local-users.mjs [count]      # bulk permanent accounts, real @supabase/ssr sessions
# build + start the app pointed at the local stack (see below), then:
node scripts/load/scale.mjs <scenario> [n]
# LOAD_APP_URL=http://localhost:3011 ... to target a second build (see the
# before/after section below for why you'd want two running at once)
```

**The `app_control_secrets` step is not optional and fails confusingly.** The
local database needs the bcrypt hash of *this machine's*
`SECURITY_CONTROL_SECRET` (`SECURITY_SETUP.md` has the insert). Skip it and
every quota-gated route returns **429 "Too many deals"** on a freshly minted
user's very first request — which reads like a rate limit and is actually
`consume_app_quota` raising `42501` and `consumeQuota()` failing closed.
The server log is the tell: `Quota control failed {"code":"42501"}`.

Scenarios: `vote-scale`, `rsvp-scale` (spread across many seeded plans, not
one — "thousands of concurrent users" for this product means many people
across many small plans hitting shared infrastructure, not one plan with
thousands of participants), `plan-create-scale`, `spot-deal-scale` (both
genuinely new — blocked entirely in the live-project pass above).

**The app's own API routes read auth from `@supabase/ssr` cookies, not a
bearer header** — `mint-local-users.mjs` derives each account's real session
cookie via the actual library (a capturing cookie-jar adapter through
`createServerClient`), not a hand-reimplementation of its serialization.
Only the direct PostgREST RPC calls (votes/RSVPs) use a bearer token, same
as the live-project driver above.

### Results — 2026-09-04, local stack, 2,500 real permanent accounts minted

| scenario | n | p50 | p90 | p99 | max | errors |
|---|---|---|---|---|---|---|
| `vote-scale` | 100 | 93ms | 149ms | 154ms | 155ms | 0/100 |
| `vote-scale` | 150 | 114ms | 202ms | 216ms | 219ms | 0/150 |
| `vote-scale` | 200 | 131ms | 239ms | 262ms | 266ms | 0/200 |
| `vote-scale` | 250 | 171ms | 321ms | 344ms | 349ms | 9/250 |
| `vote-scale` | 500 | 87ms† | 358ms | 425ms | 428ms | 261/500 |
| `rsvp-scale` | 200 | 259ms | 385ms | 406ms | 409ms | 0/200 |
| `spot-deal-scale` | 50 | 679ms | 708ms | 709ms | 714ms | 0/50 |
| `spot-deal-scale` | 100 | 2131ms | 2202ms | 2209ms | 2212ms | 12/100 |
| `plan-create-scale` | 50 | 555ms | 597ms | 605ms | 606ms | 0/50 |

† `vote-scale`'s p50 at n=500 looks better than n=250 only because most of
the 261 failed calls errored near-instantly (a rejected connection) rather
than completing slowly — not a real latency improvement. Read the error
count alongside the latency, not either alone, past the point errors appear.

**Clean through n≈200 on every scenario tried.** Past that, a real ceiling
shows up — and it's honest to name what it actually is, not oversell it:

- **`vote-scale`/`rsvp-scale` (direct-to-PostgREST):** clean to 200, minor
  degradation at 250 (9 errors), a hard wall by 500 (261 errors, "fetch
  failed" — connection resets, not an app-level rejection). This is the
  local Kong/PostgREST dev stack's own connection handling under genuinely
  simultaneous load (all `n` requests fired in one `Promise.all` tick, not
  the local machine's file-descriptor limit — `ulimit -n` here is 1,048,576).
- **`spot-deal-scale` (through the Next.js app):** a much lower ceiling —
  clean at 50, but p50 balloons to 2.1s and 12% of requests fail
  `getUser()` by n=100. This route does 5-6 sequential Supabase round trips
  per request (auth, quota, member age, spots, ratings); at 100-way
  simultaneous load, all funneled through **one single-process `next start`
  instance**, that queues badly. **This is the honest, important caveat**:
  a real deployment (Vercel) runs this route as auto-scaling serverless
  functions, not one long-lived process — this ceiling is specific to "one
  local server instance," not a statement about production capacity. It's
  the same category of caveat this file's own dev-vs-prod-build baseline
  already makes, just for horizontal scaling instead of build mode.
- **`plan-create-scale`:** only tested to 50 (clean) — this scenario exists
  mainly to prove migration 033's fix holds under real concurrency, which it
  does; the write itself (`create_secure_plan`) is a single RPC call, same
  shape as vote/rsvp, so it's expected to scale similarly to those once
  pushed further.

**What this does and doesn't prove:** real code, a real database, real
concurrency mechanics, at real numbers this session couldn't reach against
the live project. It does not prove production capacity — this is one
Docker Postgres + one Node process on one machine, not Vercel's
serverless scaling or Supabase's hosted connection pooler. Re-run against a
real deployment for a field number, same standing caveat as the `home`
baseline above.

### A real bug this testing surfaced (not a load/perf finding) — the priority one

Load-testing `plan-create-scale` for the first time (blocked entirely in the
live-project pass) immediately hit a **Critical, live, 11-day-old bug**:
`create_secure_plan` required all 9 spot ids to share the plan's category,
but no curated category has 9 spots, so the deal system always spans a
category family — every real plan creation has failed since migration 020
went live. Confirmed against the live database: 6 plans exist, ever; the 1
created since migration 020 is this session's own SQL-inserted fixture, not
a real user. **Migration 033** fixes it, `security`-reviewed. Full writeup
in `worklog.md`'s CRITICAL entry — this is a correctness finding a lot more
important than any number in the table above, and it's the reason
`plan-create-scale` wasn't pushed past n=50 this session: verifying the fix
took priority over chasing a bigger number on now-stale code.

### Before/after: parallelizing `getUser()` + `consumeQuota()` (7c69a9c)

The ceiling above named five to six sequential Supabase round trips per
`/api/spots/deal` request as the cause. 7c69a9c removed one of them from the
critical path — `consumeQuota()` never needed `getUser()`'s return value, so
both now run under one `Promise.all`. Measured, because the point of naming a
cause is to check it.

**Method.** Both builds run at once (`de74974` on :3011, `7c69a9c` on :3010;
`LOAD_APP_URL` picks the target) and reps alternate between them. This
matters: a single server's first runs are ~2x its later ones as the JIT
warms, so measuring build A and then build B measures the warm-up, not the
change — a first sequential attempt here showed "40% faster" that was
entirely the server getting warmer. Both are warmed with 3 discarded rounds,
reps are paired, and the median of per-rep p50s is what's compared.

| n | before (median p50) | after | delta | after wins |
|---|---|---|---|---|
| 1 (uncontended) | 61.6ms | 56.3ms | **−5.3ms (8.5%)** | **12/12 reps** |
| 50 | 431.0ms | 462.3ms | +31.3ms (−7.3%) | 3/8 reps |
| 100 | 1149.8ms | 1112.2ms | −37.6ms (3.3%) | 3/6 reps |

**Uncontended, the change is real but small**: ~5ms, winning all 12 paired
reps — which is what makes a 5ms claim believable rather than noise; a coin
lands that way once in 4,096 tries. That is about the cost of one local round
trip, which is exactly what was removed. Against hosted Supabase, where a
round trip is tens of milliseconds rather than five, the same saved trip
should be worth proportionally more.

**Under load it does not help, and the ceiling did not move.** At n=50 and
n=100 the deltas sit well inside run-to-run noise (single reps swing
880-1905ms at n=100), paired wins are a coin flip, and error counts stay
erratic in *both* builds (0-34 per 100). That is a **null result for the
thing it was aimed at**, and worth recording as one. The ceiling was never
serial round trips: it is one `next start` process saturating, and issuing
two queries simultaneously instead of consecutively doesn't reduce the work
queued behind them. Removing a round trip shortens a request; it doesn't
widen the pipe.

Keep the change — strictly less waiting per request, costs nothing, worth
more off-loopback. Don't credit it with raising the ceiling. Moving n=100
is a horizontal lever (serverless instances, which a real deployment already
provides), not a matter of shaving trips off a saturated single process.

### Bonus: `npm run test:db` runs for real now

The same local stack this phase built makes the previously self-skipping
`tests/*.dbtest.ts` suite actually execute for the first time in this
environment (`TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run test:db`)
— 12/12 passing, 0 skipped, across both migration-023 and migration-025's
concurrency-correctness suites. Not new tests, just real coverage where
there was previously an infrastructure gap.

## Not yet measured

- Anything under real network conditions or a real (Vercel) deployment —
  every number above is loopback/local-Docker, a ceiling for this
  environment, not a field number.
