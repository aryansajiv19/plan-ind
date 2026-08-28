---
name: house-rules
description: "The rules every plan-ind lane inherits regardless of what it is building, plus the verification gate a task must pass before it can be called done. Use at the start of any task and again before reporting completion."
---

# House rules

Nine rules, each one sourced from a bug this repo actually had.

1. **Never show invented data as a signed-in user's own.** `DemoAccountViews` is
   fixtures and renders only when `demoMode` is true (`/home-preview`).
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

6. **Migrations are additive and numbered.** 020 is applied live; 021 is written
   and unapplied; the next new number is 022. Record application in `worklog.md`
   the same day.

7. **`supabase/schema.sql` is a scratch end-state, not an update path.** It DROPs
   every table. Never run it against the live project. When you add a migration,
   add the same objects here too — functions and indexes, not just columns.

8. **No new dependencies without a reason you can state.** Tests use Node's
   built-in runner.

9. **No green glowing dots or pulsing status lights.** Recorded permanently in
   `FRONTEND_DESIGN_STANDARDS.md`.

## The gate

```bash
npm run lint
npx tsc --noEmit
npm run test          # 25 today
npm run build
git diff --check
```

Stop and fix on any failure. **Never claim done with a red check.**

`test:security` and `test:wrapped` are plain aliases for `npm run test` and
filter nothing — a green `test:security` is not targeted security coverage.
`test:smoke` needs a running server and real Supabase credentials; it is
deployment verification, not regression coverage, and is expected red for
unapplied-migration guards.

## Blocked is a valid outcome

Three blockers sit outside this repo: anonymous sign-ins are disabled in Supabase
Auth (which kills the whole share-link vote path), migration 021 is unapplied,
and OpenAI credits are exhausted. If your task depends on one, **say so plainly
and stop** — do not simulate around it, and do not report success you could not
verify. A short honest report beats a padded one.
