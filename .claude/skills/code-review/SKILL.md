---
name: code-review
description: "What to look for when reviewing a plan-ind diff — correctness at the boundaries this repo actually breaks at, and the over-engineering it is prone to. Use when reviewing a lane's work before the orchestrator commits a wave."
---

# Code review

Review the diff for what breaks *here*, not for style. Two lenses, in order.

## Correctness

1. **Did the types move with the schema?** `lib/types.ts` mirrors
   `supabase/schema.sql` by hand. A migration without the matching type change is
   the single most breakable thing in this repo.

2. **Does a new function repeat the `revoke from public` mistake?** It must
   `revoke all … from public, anon, authenticated` and grant back explicitly.

3. **Does anything trust a client-supplied identity or age?** Age comes from
   `memberAge()`. `auth.user_metadata` is browser-writable.

4. **Is a `200 []` being read as "no rows"?** It is ambiguous under RLS.

5. **Does a UI change imply enforcement that does not exist server-side?**

6. **Does every Realtime subscription `removeChannel` on unmount?**

7. **Does script-driven motion check `prefers-reduced-motion` directly?** The
   global CSS override cannot reach a `requestAnimationFrame` loop.

8. **Is a new colour pair measured against both grounds, with the ratio in a
   comment?**

9. **Is anything rendered that does not work** — an empty `booking_url`, a dead
   button, fixture data shown as a real user's own?

## Over-engineering

The repo's own rule: extract a shared class or component only after **3+**
repeats. Look for the opposite failure too — the UI currently has almost no
shared abstraction, and empty states are hand-rolled five times over.

Flag: an interface with one implementation; a config value that never changes; a
new dependency where a few lines would do; scaffolding "for later". Prefer
deletion over addition, and boring over clever.

Also flag **dead code that is about to be left dead a third time**. `globals.css`
carries ~450 lines of CSS for elements no component renders. Adding more to it is
worse than deleting some.

## Reporting

Most severe first. Each finding: `file:line` — what is wrong — the concrete
failure it causes — rough effort. Distinguish a real defect from an accepted
tradeoff; this repo has several of the latter, recorded in `worklog.md`, and
re-reporting them wastes attention.

Do not weaken a check to make a diff pass. Do not approve a wave whose
verification is red.
