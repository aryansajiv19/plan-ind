# lib/ — shared logic

**Read when:** editing anything under `lib/` except `lib/ai/`, which has its own
file. Subdirectories carry the rules for their own domain.

## What belongs here

Pure logic and thin data access that more than one screen needs. If only one
component uses it and always will, it lives next to that component instead.

- **No JSX.** Anything rendering belongs in `components/`.
- **No `"use client"` at module scope side effects.** `lib/supabase.ts` exports
  `getSupabase()` (memoised) precisely because a module-level `createClient()`
  made the whole signed-in data layer impossible to unit test. Don't
  reintroduce work at import time — it silently sets the testability boundary.

## The rule this repo keeps breaking

**Empty, refused and truncated are three different things.** A read that fails
must not render as "nothing there".

- A first load is **load-critical**: surface the error and offer a retry.
- A later refetch keeps the last good value rather than wiping a working screen.
- Every Supabase write goes through `.select()` so a **0-row** result is
  distinguishable from success. PostgREST returns `200 []` for a refused
  delete, identical to "already gone" — check the row, never the status.
- A helper returning a boolean invites this; prefer a named result
  (`"allowed" | "limited" | "unavailable"`) when a caller could otherwise
  collapse a failure into a normal outcome.

## Map

| Path | Holds | Note |
|---|---|---|
| `security/` | quotas, CSRF, control secret | `resolveAppOrigin` is the single source of app origin; all three consumers share it |
| `supabase/` | browser + server clients, config | |
| `spots/`, `deal.ts` | dealing the nine | category "nearness" ordering lives in `spots/match.ts` |
| `place-import/` | link intake, SSRF guards | allowlisted adapters only; never a generic fetch of an arbitrary URL |
| `places/` | Google Places client, matcher, SQL gen, photo fallback | field masks are reviewed constants (billing tier); only `place_id` may be stored |
| `observability/` | structured logging | redaction matches by substring marker, not exact name |
| `social.ts`, `social/` | profiles, friends, invites, visits, photos, collections, moodboards, Wrapped reads | `social.ts` is the public barrel — callers import `@/lib/social`; add code to the module that owns it |
| `types.ts` | mirrors `supabase/schema.sql` | hand-synced, both change in one pass, CI enforces |
