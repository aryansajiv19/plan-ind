---
name: migrations
description: "How schema change ships in plan-ind — numbered additive migrations against the live database, never schema.sql, with the types file kept in lockstep. Use before writing any SQL, and before claiming a migration is applied."
---

# Migrations

Two files look like they do the same job and do not. Getting this wrong destroys
data.

| | `supabase/schema.sql` | `migration-0NN-*.sql` |
|---|---|---|
| Purpose | canonical end state for a **scratch** project | the **only** live change path |
| Opens with | `drop table … cascade` on **every** table | additive DDL |
| Run against live? | **never** | yes, then record it |

`schema.sql` is not an update path. It DROPs every table — far more than the
original four. A previous agent added only columns to it and left it unable to
produce a working database, so when you add a migration, **add the same objects
to `schema.sql` too — functions and indexes, not just columns.**

## Non-negotiables

1. **Migrations are additive and numbered.** 020 is applied and verified live
   (2026-08-24). 021 is written, committed and **unapplied** — fix it in place
   only until it is applied; after that the next number is 022.

2. **Record application in `worklog.md` the same day.** That table is the source
   of truth; prose scattered through checkpoints stopped being trustworthy at 014.
   Never mark a migration applied you did not watch apply.

3. **`lib/types.ts` mirrors the schema, by hand.** No codegen. They change
   together, in one pass, by one agent. The docs call this the single most
   breakable thing in the repo.

4. **Never add a direct insert/update/delete policy on `votes`, `rsvps` or
   `ratings`.** Writes go through the security-definer RPCs `cast_plan_vote`,
   `set_plan_rsvp`, `rate_plan`, behind an `enforce_plan_membership` trigger.
   Adding a policy reopens exactly what 018/019 closed.

5. **`revoke … from public` does not cancel a named grant.** Supabase grants
   EXECUTE to `anon` and `authenticated` by name at function creation. Migration
   020 revoked from `public` and left the `anon` grant standing, which is how
   `valid_control_secret` became a live unauthenticated oracle. **Every new
   function must `revoke all … from public, anon, authenticated` and then grant
   back explicitly.**

6. **Probe live rather than assuming.** An unauthenticated call returning `42501`
   proves nothing about your input — the guard raises the same way regardless.
   PostgREST resolves functions by exact parameter-name set, so a wrong argument
   list returns `PGRST202` identically to a missing function. Two false
   conclusions have already been drawn this way.

7. **No service-role key exists, and none may be added.** Nothing secret may ever
   land in a `NEXT_PUBLIC_` variable.

## Error codes worth knowing

| Code | Means |
|---|---|
| `PGRST202` | function absent **or your signature is wrong** |
| `PGRST205` | table absent from the schema cache |
| `42501` | permission denied / guard raised |
| `200 []` | ambiguous — RLS-hidden and genuinely-empty are indistinguishable |
