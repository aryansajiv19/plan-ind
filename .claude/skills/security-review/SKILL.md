---
name: security-review
description: "How to audit plan-ind against its current posture rather than its documented one, how to probe the live database without drawing false conclusions, and how to calibrate severity for a going-out app. Use for any security review, and before filing any finding."
---

# Security review

**Audit the schema that exists, not the one the docs describe.** The agent docs
described a pre-auth `using (true)` world long after migration 020 replaced it,
and a reviewer following them would audit a database that is gone. `worklog.md`
is the source of truth for what is actually live.

## Probing without fooling yourself

Two false conclusions have already been drawn and reported to the owner here.
Both came from trusting an error code:

1. **`42501` proves nothing about your input.** A guard written as
   `if not valid_secret(...) or uid is null` raises identically whether the
   secret was wrong *or* you simply had no session. An unauthenticated curl
   returning `42501` is not evidence the secret was rejected.
2. **`PGRST202` means "function absent **or your signature is wrong**".**
   PostgREST resolves by exact parameter-name set — calling a 7-argument function
   with 4 arguments looks exactly like a missing function.

Also: **`200 []` is ambiguous.** RLS-hidden and genuinely-empty are
indistinguishable through PostgREST. Never infer "no rows exist" from it.

Probe positively where you can — call the thing directly and observe the
difference between a true and false input — and say which method you used.

## What is genuinely worth checking

**The anon-execute gap**, the live defect class here. `revoke … from public` does
not cancel Supabase's named grants to `anon`. Check every function for it, not
just the known two (`valid_control_secret`, `execute_plan_command`).

**Definer functions are the write surface.** Each bypasses RLS as owner, so its
input validation *is* the boundary. Does it check `auth.uid()`? Validate every
argument? Can a caller pass a `plan_id` they hold no `plan_access` for? Does it
ever **return a value where a raise belongs** — the `valid_control_secret`
mistake repeating?

**Age enforcement.** Server-owned `member_ages` via `memberAge()` only. Never a
request body, never `auth.user_metadata`. Ranking may reorder in `ORDER BY`; it
must never override a `WHERE` gate.

**Realtime.** It respects RLS, and RLS is now `plan_access`-scoped — but confirm
that holds for Presence, and that no whole-row broadcast carries a column that
has no select policy behind it.

**Environment-conditional auth.** `/api/smart-search` skips its auth check when
`NODE_ENV !== "production"` and consumes quota only when a user is present.
Check whether preview deploys inherit it, and whether newer routes copy it.

**Secrets.** The anon key is public **by design** — reporting it as a leak is
noise. `OPENAI_API_KEY` and `SECURITY_CONTROL_SECRET` are server-only and must
never gain a `NEXT_PUBLIC_` prefix. No service-role key exists; report one if it
ever appears.

## Calibration

This is a social going-out app, not a bank. The honest impact of a vote flaw is
"someone rigs where six friends eat" — inflating that to breach language trains
the owner to ignore you. Equally, do not deflate a real one.

Every finding carries: severity · location · the concrete attack · impact · the
fix · the owning agent · and whether it is already accepted.

**Recorded and accepted — not findings:** the public anon key; age-restricted
venue enumeration via `read permitted spots` (visibility, not bypass; deferred by
owner decision); no quota on `/api/spots/deal` (deferred to migration 022).

**Superseded — do not re-report:** vote impersonation by typing a friend's name,
cross-plan reach from unscoped `using (true)`, open `people`/`friendships`/
`visits` write policies. All closed by migration 020.

## You have no write tools

Enforced in your frontmatter, not just asked of you. Never edit a file, never
implement a fix, never modify a test, and never mark your own finding resolved —
re-read after the owning agent reports a fix, then confirm. Say plainly when you
find nothing new. A short honest audit beats a padded one.
