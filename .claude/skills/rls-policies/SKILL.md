---
name: rls-policies
description: "plan-ind's current RLS posture — plan_access-scoped reads, RPC-only writes, and the tables with deliberately zero policies. Use before adding or changing any policy, grant, or security-definer function."
---

# RLS policies

**The posture changed and the docs lagged.** Anything describing this app as
"no auth, `using (true)` everywhere" is pre-020 and wrong. Migration 020
(`production-security`, applied live 2026-08-24) ended that. `worklog.md` is the
source of truth.

## What is true now

- **Reads** on `plans`, `plan_spots`, `votes`, `rsvps`, `ratings` and `spots`
  scope through the `plan_access` capability table, granted `to authenticated`.
  `plan_access` itself exposes own-rows-only.
- **Writes** to `plans`, `plan_spots`, `votes`, `rsvps`, `ratings`: **no direct
  policy at all.** Only the security-definer RPCs `create_secure_plan`,
  `cast_plan_vote`, `set_plan_rsvp`, `rate_plan`, `execute_plan_command`, behind
  an `enforce_plan_membership` trigger.
- **Zero-policy tables**, reachable only by definer functions:
  `app_control_secrets`, `app_rate_limits`, `security_events`. RLS on, no
  policies — deny-all to every client role.
- **`plan_host_tokens`** has no select policy; the host token hash is invisible
  to every client. **`member_ages`** is write-once via `set_birth_date`.

## Non-negotiables

1. **Never add a direct write policy on `votes`, `rsvps` or `ratings`.** It
   reopens the hole 018/019 closed. If a write needs a new shape, it gets a new
   RPC, not a policy.

2. **A definer function bypasses RLS as owner, so its validation *is* the
   boundary.** Every one must check `auth.uid()` is non-null and validate every
   argument it trusts. Whitelist keys, bound numbers, cap text.

3. **Never return a value where a raise belongs.** A definer function that
   returns a boolean to an unauthorized caller is an oracle — that is exactly
   what `valid_control_secret` is. Raise instead.

4. **`revoke … from public` leaves `anon` standing.** Revoke from
   `public, anon, authenticated` explicitly, then grant back. One deliberate
   exception exists and is documented: `record_security_event` keeps its `anon`
   grant because OTP telemetry is written before a session exists — and it
   returns `void`, so it discloses nothing.

5. **Never put a secret in a column on `plans`.** Reads are membership-scoped,
   but Realtime can still broadcast whole authorized rows. Secrets live in a
   separate table with no select policy.

6. **Age comes from server-owned `member_ages`** via `memberAge()` — never a
   request body, never `auth.user_metadata`, which the browser can rewrite.
   Similarity or ranking may reorder in `ORDER BY`; it must never override an age
   or budget gate in `WHERE`.

## Recorded and accepted — do not re-report as new

- The anon key is public by design.
- `read permitted spots` has no age predicate, so any authenticated account can
  enumerate 21+ venues by name. Catalog **visibility**, not an authorization
  bypass — plan creation does enforce age server-side. Owner-deferred.
- `/api/spots/deal` has no quota scope; deferred to migration 022.
