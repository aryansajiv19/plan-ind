# tests

Four kinds of tests live here.

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

### `rsvp-rating-upsert-race.dbtest.ts` — migration 025

Same double-write race migration 023 closed on `votes`, closed here on
`set_plan_rsvp` and `rate_plan`. Both do `select ... for update` then
insert-if-absent / update-if-present; that locks nothing when the row doesn't
exist yet, so two concurrent *first-time* calls for the same `(plan_id,
voter_name)` could both reach the insert branch and race the table's `unique
(plan_id, voter_name)` constraint. 025's fix: loop, retry into the update
branch on `unique_violation`.

For both functions:

1. **Non-concurrent sanity** — first call inserts, second (same voter, same
   token) updates in place; one row.
2. **Concurrency, DIFFERENT tokens** (two people racing to claim the same
   name) — fired from two separate Postgres backends, forced to interleave by
   holding the insert-winner's transaction open behind an explicit
   `pg_sleep(1)` before commit. Exactly one call fails, and only with the
   function's own clean `42501 That participant name is already in use` — the
   test asserts the failure message does **not** match `duplicate
   key|unique_violation|23505`, i.e. no raw Postgres error leaks through. One
   row lands, belonging to the insert winner.
3. **Concurrency, SAME token** (client retry / double-tap) — same interleave
   technique, both calls succeed, one row, no unhandled exception.

### How to run any `*.dbtest.ts`

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

### Note from the migration-025 QA pass

No Supabase CLI was available in that environment (`supabase start` couldn't
be used). Both `.dbtest.ts` files were instead run and verified green against
a throwaway database on the machine's local Homebrew Postgres, hand-stubbed to
be Supabase-shaped: an `auth` schema with a minimal `auth.users` table,
`auth.uid()` / `auth.jwt()` reading `request.jwt.claims` the same way real
Supabase does, `anon`/`authenticated` roles, and bare-minimum `storage.*` /
`realtime.*` stub schemas (`storage.buckets`, `storage.objects`,
`storage.foldername()`, `realtime.messages`, `realtime.topic()`) — just enough
surface for `schema.sql` to load end to end without touching the objects the
Supabase platform itself provides in a real project. The database was dropped
immediately after. Anyone reproducing this without the Supabase CLI needs the
same stub; with the CLI, `supabase start` provides all of it for free and none
of this is necessary.

## End-to-end tests — `npm run test:e2e`

Playwright, real Chromium, against a running app — `tests/e2e/*.spec.ts`,
config at `playwright.config.ts`. Not part of `npm test`/the lint-tsc-test-build
gate: it needs `@playwright/test`'s browser binaries, which no worktree in
this repo installs on its own (see "Setup" below).

- `guest-vote.spec.ts` — the guest share-link vote path end to end, against
  the **live Supabase project** (`.env.local`): opens the seeded plan
  `22222222-2222-2222-2222-222222222222`, types a name, casts a vote, and
  checks the card and the voter count both update. Self-skips if
  `NEXT_PUBLIC_SUPABASE_URL` isn't set. This plan is shared fixture data —
  other sessions/CI runs may vote on it too, so the assertion is "the count
  went up", not an exact before/after number.
- `login-redirect.spec.ts` — FE.10's `next` param wiring on `/login`: a valid
  `?next=` is carried as a hidden field into both the email and Google forms;
  an unsafe value (`https://evil.example.com`) falls back to `/home`; no
  param at all still defaults every form to `/home`. This is a DOM-level
  check, **not** a full authenticated round trip — completing the OTP step
  needs a real inbox, and both sign-in paths require a Turnstile token once
  `NODE_ENV=production` (which `playwright.config.ts`'s `webServer` runs
  under, via `next build && next start`), so neither form can actually be
  submitted here. The full round trip was verified by hand — see the Review
  entry for 2026-09-02 in `AGENT_COORDINATION.md`.

### Setup (not done by default — affects the shared `node_modules`)

Lane worktrees share one `node_modules` via symlink (see the top of
`AGENT_COORDINATION.md`), so installing browser binaries from inside a
worktree affects every other session on this machine. `@playwright/test` is
declared in `package.json` and `package-lock.json` (added with
`--package-lock-only`, so this alone did **not** touch `node_modules`), but
actually running these specs needs:

```
npm install                              # materializes @playwright/test
npx playwright install --with-deps chromium
npm run test:e2e
```

Whoever runs this should do it once, somewhere that's fine to affect the
shared install (the main tree, or CI) — not casually from inside a lane
worktree.

### For T0 / CI

Same idea as `test:db`: its own job, after the hermetic suite, with the setup
above run first. `PLAYWRIGHT_BASE_URL` can point the specs at an
already-running deployment instead of having Playwright build+start one
itself.
