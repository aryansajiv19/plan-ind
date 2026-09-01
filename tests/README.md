# tests

Two kinds of tests live here.

## Hermetic unit tests — `npm test`

`node --test` over `tests/*.test.ts`. No network, no database. These are the
default and run in CI on every push.

- `security.test.ts` — request validation / CSRF / body limits
- `spots-match.test.ts` — spot matching
- `wrapped.test.ts` — wrapped summary logic
- `auth.test.ts` — `safeNextPath` post-login redirect guard

### Path/module resolution

`npm test` runs with `--import ./tests/register-aliases.mjs`, a Node
`module.register()` hook (`tests/resolve-aliases.mjs`) that exists only so
plain `node --test` can import files that use the `@/*` tsconfig alias or
extensionless `next/*` specifiers (e.g. `next/navigation`, `next/headers`) —
neither resolves under Node's ESM loader without a bundler. It rewrites
`@/x` to `<repo>/x.ts` and adds `.js`/`.ts` extensions where needed; it does
not change any runtime behavior of the app. If a test needs to import a `lib/`
file that pulls in Next/Supabase server-only imports transitively (as
`lib/auth.ts` does via `@/lib/supabase/server`), this is why it works — those
transitive imports are never called, only resolved and loaded.

## Database integration tests — `npm run test:db`

`node --test` over `tests/*.dbtest.ts`. These need a **real Postgres shaped
like Supabase** (the `auth` schema, `auth.uid()`, the `authenticated`/`anon`
roles, RLS, the `votes_require_plan_access` trigger, and the security-definer
RPCs). They are **not** run by `npm test` and they **skip themselves, loudly,
with a one-line reason** when the infra is missing — a skipped suite is not a
passing suite, check the output.

### `vote-idempotency.dbtest.ts` — migration 023

Covers the cross-lane request from T1:

1. **Idempotency of `cast_plan_vote`** — double call is a no-op (identical
   jsonb, one row); switching the pick stays at one row pointing at the new
   spot; `p_value = false` clears it (zero rows, `spot_id: null`).
2. **Tally under a concurrent double-vote** — two `cast_plan_vote` calls for
   the same participant/round on different spots, fired as two separate
   Postgres backends, leave exactly one `votes` row (the
   `votes_participant_round_key` unique index serialises them, second lands as
   `ON CONFLICT DO UPDATE`). The `execute_plan_command`-shaped pool tally then
   counts that participant as exactly one YES, and the real
   `execute_plan_command(..., 'advance')` advances cleanly off that state.
3. **Pool tally determinism** — a 1-1 tie resolves to the same finalist on
   every run and regardless of vote insertion order (ascending `spot_id`
   tiebreak, matching `execute_plan_command`).
4. **`cast_plan_vote` EXECUTE grant** — `authenticated` only, never `anon` or
   PUBLIC (catches a dropped `revoke ... from public`).

### How to run it

```
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  npm run test:db
```

`TEST_DATABASE_URL` defaults to the standard `supabase start` port (54322).

**NEVER point `TEST_DATABASE_URL` at the live project.** `supabase/schema.sql`
DROPs all four tables when re-run and these tests write throwaway rows. Use a
local `supabase start` database seeded from `schema.sql`, or an equivalent
throwaway.

### What the test needs from its fixtures

Each test creates its own plan (random uuid), its own three `spots`, its own
`plan_host_tokens` row, and — per participant — an `auth.users` row plus a
`plan_access` row, then sweeps all of it in an `after` hook. It talks to
Postgres through the `psql` CLI (already a dependency of the Supabase local
stack), so no new npm package is added.

The one infra assumption that may need a tweak when CI wires this up: the
`auth.users` insert uses `(id, aud, role, email, created_at, updated_at)`. If a
future GoTrue schema adds a NOT NULL column without a default, add it there —
it is the only place the tests touch `auth`.

## For T0 / CI

To make `test:db` execute rather than skip:

1. Install the Supabase CLI and `supabase start` (or stand up any Postgres with
   the `auth` schema, `auth.uid()`, and the `authenticated` / `anon` roles).
2. Load `supabase/schema.sql` into it (fresh DB only — it is destructive).
3. Set `TEST_DATABASE_URL` in the CI job env.
4. Add `npm run test:db` as a CI step (its own job, after the hermetic suite).

Until then the suite reports, e.g.:
`SKIP no reachable Postgres at postgresql://... — set TEST_DATABASE_URL to a
LOCAL Supabase`.
