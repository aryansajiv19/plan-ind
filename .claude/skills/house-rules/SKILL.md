---
name: house-rules
description: "The rules every plan-ind lane inherits regardless of what it is building, plus the verification gate a task must pass before it can be called done. Use at the start of any task and again before reporting completion."
---

# House rules

Nine rules, each one sourced from a bug this repo actually had.

1. **Never show invented data as a signed-in user's own.** `DemoAccountViews` is
   fixtures and renders only when `demoMode` is true (`/demo`).
   `AccountViews` is the real one. A screen with no data gets an honest empty
   state — do not fill it in with examples.

2. **Never read date of birth from `auth` user_metadata.** The browser can
   rewrite it. Use `memberAge(supabase, userId)` from `lib/age-policy.ts`. The
   only write path is the write-once `set_birth_date` RPC.

3. **Never add a column holding a secret to `plans`.** Realtime can broadcast
   whole authorized rows. Secrets go in a table with no select policy — see
   `plan_host_tokens`.

4. **Never add a direct insert/update/delete policy on `votes`, `rsvps` or
   `ratings`.** Those writes go through security-definer RPCs. A policy reopens
   what migrations 018/019 closed.

5. **`lib/types.ts` mirrors the schema.** Change them together, in one pass, by
   one agent.

6. **Migrations are additive and numbered.** Fix one in place only until it's
   applied; after that the next number is the only option. Record application
   in `worklog.md`'s runbook table the same day — check that table for what's
   actually live now, don't assume from a stale number here.

7. **`supabase/schema.sql` is a scratch end-state, not an update path.** It DROPs
   every table. Never run it against the live project. When you add a migration,
   add the same objects here too — functions and indexes, not just columns.

8. **No new dependencies without a reason you can state.** Tests use Node's
   built-in runner.

9. **No green glowing dots or pulsing status lights.** Recorded permanently in
   `docs/FRONTEND_DESIGN_STANDARDS.md`.

## The gate

```bash
npm run lint
npx tsc --noEmit
npm run test          # check the current count yourself, it moves
npm run build
git diff --check
```

Stop and fix on any failure. **Never claim done with a red check.**

`test:smoke` needs a running server and real Supabase credentials; it is
deployment verification, not regression coverage, and is expected red for
unapplied-migration guards.

## Production standards (owner, 2026-09-26: applies to everything)

The app is a public CV link: secure, scalable, usable, never a prototype. Each
line says where plan-ind already meets it; extend that, don't reinvent it.

- **Passwords:** none stored by us. Supabase Auth (email code, Google).
- **Input:** validate in the client for UX and again on the server. The DB
  cleans text itself (`clean_app_text`, `clean_display_name`); RPCs check every
  argument. Model output is input too (`openai-responses` skill).
- **Queries:** supabase-js/PostgREST or SQL functions with parameters. Never
  build SQL from strings; dynamic SQL in plpgsql uses `format(%I, %L)`.
- **Rate limits:** `consume_app_quota` / `consume_otp_limit` live in Postgres,
  so every server instance shares one limit. New public or auth endpoint →
  add a scope there. Turnstile gates sign-in.
- **AuthZ:** server side, every time: RLS by plan membership, writes through
  security-definer RPCs, route handlers call `getUser()` before acting. A
  hidden button is not a check.
- **Secrets and errors:** server-only env, never `NEXT_PUBLIC_`; map DB errors
  to human messages (`lib/participant-errors.ts`), never pass raw ones through.
- **Headers:** nonce CSP in `proxy.ts`; same-origin only, CSRF double-submit +
  Origin check (`lib/security/request.ts`).
- **Uploads:** `lib/upload.ts` checks type, bytes and pixels; storage paths
  are scoped to the uploader's uid; nothing uploaded is ever executed.
- **Multi-instance:** no app state in server memory. Limits and state live in
  Postgres; `unstable_cache` is only a cache (safe to lose, bounded TTL).
- **Queries at scale:** index what you filter or join on, no N+1 (one query
  with a join or `in`), `.limit()`/`.range()` on every list.
- **Slow work:** off the request path. Scheduled cleanup is `pg_cron`; email is
  Supabase Auth's. If a feature needs a queue, say so before building it.
- **Errors and logs:** no unhandled throw reaches the user; log key actions and
  failures via `lib/observability/log.ts` (it redacts tokens and auth
  headers); `security_events` stores hashed subjects. Never log PII or secrets.
- **UI states:** loading, empty, error and refused are four different states
  (the silent-failure class); every screen handles all four in plain words.
- **Concurrency:** assume many people act at once; mutations are idempotent
  and race-tested (`test:db`).

**After the first working version of anything:** list its security and
scalability concerns unprompted, then offer a `security` review and a
scalability pass (`scripts/load/`) before it ships. If a request would add
risk, say so before building and propose the safer shape. Ask about expected
scale when the answer changes the design.

## Blocked is a valid outcome

If your task depends on something outside this repo (a key, an owner decision,
network access), **say so plainly and stop**: do not simulate around it, and do
not report success you could not verify. `PRIORITIES.md`'s "Waiting on the
owner" table is the current list. A short honest report beats a padded one.
