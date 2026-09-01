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

## Not yet measured

- Any authenticated or mutating route (`deal`, `cast_plan_vote`, `create_secure_plan`) —
  needs a real permanent session.
- Anything under real network conditions — this is loopback, so it's a
  ceiling, not a field number. Re-run once deployed (Vercel) for a true figure.
