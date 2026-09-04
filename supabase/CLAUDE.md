# Working in `supabase/`

Loads only for sessions touching this directory. Root `CLAUDE.md` has the
invariants; this has the rules for changing the database.

## Hard rules

- **Migrations are additive and numbered.** Fix a migration in place only until
  it is applied; after that the next number is the only option. Record every
  application in `worklog.md`'s runbook table **the same day**.
- **`schema.sql` is the end-state for a scratch project, not an update path.**
  It DROPs every table. Never run it against the live project, and never point
  an integration test at one. If you add a migration, mirror the same objects
  into `schema.sql` — **including functions and indexes**, not just columns. A
  previous agent added only columns and left the file unable to produce a
  working database.
- **`lib/types.ts` mirrors this schema**, hand-synced. Change both in one pass.
  CI enforces it (`npm run check:schema`).
- **Never add a direct insert/update/delete policy on `votes`, `rsvps` or
  `ratings`.** Those writes go through the security-definer RPCs
  (`cast_plan_vote`, `set_plan_rsvp`, `rate_plan`). Adding a policy reopens
  what migrations 018/019 closed.
- **Never add a column holding a secret to `plans`.** Realtime broadcasts whole
  authorized rows. Secrets go in a separate table with no select policy — see
  `plan_host_tokens`.
- **`create or replace function` preserves the ACL; `drop` + `create` does
  not** — the latter re-grants `anon`/`authenticated` by name via Supabase's
  default privileges. Any migration that drops and recreates a function must
  re-run its `revoke`. This exact mistake created a live auth oracle once
  (migration 021 fixed it) and `42P13`-blocked another (023).
- **`revoke ... from public` does NOT cancel a named grant to `anon`.** Revoke
  from `public, anon, authenticated` explicitly. This is the single most
  repeated bug in this directory's history — migrations 021 and 024 both exist
  solely to clean it up.

## Probing the live database — traps that caused false conclusions

- **PostgREST resolves functions by exact parameter-name set.** A wrong arg
  list returns `PGRST202`, identical to a genuinely missing function. Copy
  signatures out of the migration file. A 4-arg probe of `cast_plan_vote` (it
  takes 7) produced a false "missing".
- **Never test the control secret through `consume_app_quota`.** Its guard is
  `not valid_control_secret(...) or uid is null or ...`, so an unauthenticated
  call raises the same `42501` whether the secret is right or wrong.
- **`200 []` is ambiguous.** PostgREST returns it both when RLS hides rows and
  when a table is empty. A read test that passes either way proves nothing —
  assert on a write attempt instead.
- **Probe positively.** `42501` proves your caller lacked permission, not that
  your input was rejected for the reason you assumed.

## Applying migrations

The Supabase MCP (`mcp__plugin_supabase_supabase__apply_migration`) works
against the live project when authenticated. **This project has no migration
ledger** — `list_migrations` is empty and MCP migration names don't match the
repo's numbered files. Verify by direct catalog probe (`pg_proc`, `pg_indexes`,
`pg_publication_tables`), never by assuming the apply succeeded.

Applying to live production is an **owner decision**, every time. Stage the
migration, describe what it changes, and ask.

## Deeper reference

`.claude/skills/migrations`, `.claude/skills/rls-policies`,
`.claude/skills/security-review`. Runbook of what is applied where:
`worklog.md`.
