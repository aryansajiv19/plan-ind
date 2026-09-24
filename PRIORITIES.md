# Priorities

**Read when:** starting a session, or deciding what to do next. The queue only —
detail lives in the code, `worklog.md`, and `docs/`. Previous long-form version:
`docs/archive/PRIORITIES-2026-09-18.md` (full reversibility audit, scale notes,
backlog reasoning).

Legend: `S` under a day · `M` a day or two · `L` more.

## Waiting on the owner

| # | Item | Why it matters |
|---|---|---|
| O1 | **Push the unpushed local commits** on `ai-engineering` (production runs `d536b6f`, which is not on GitHub) | The live code exists only on one machine |
| O2 | **Turnstile:** add `plan-ind.vercel.app` to the widget's hostnames; put the secret key in Supabase → Auth → Attack Protection | Production sign-in and guest voting are impossible until both are done (`docs/DEPLOYMENT.md`) |
| O3 | **Google Places API key** — Places API (New) only, budget alert set, stored in Vercel as `GOOGLE_PLACES_API_KEY` (server-only, never `NEXT_PUBLIC_`) | Unblocks venue photos, ratings, hours — the biggest visual gap (6 of 82 venues have a photo) |
| O4 | **Approve live migrations**: 049 + 051 (hide `user_id` columns), then 061 (one ballot per account; back up votes/rsvps/ratings first) and 062 (link previews). Both reviewed by `security` | Every live DB write is an owner decision |
| O5 | **Keep the database awake**: a daily `/api/health` ping is committed (`.github/workflows/keepalive.yml`) and starts once it reaches `main`; Supabase Pro removes the risk entirely | A paused DB is a dead CV link |
| O6 | **Cloud-session network access**: allow `*.supabase.co`, `plan-ind.vercel.app`, `api.open-meteo.com` | Lets sessions verify against live instead of guessing |
| O7 | Make `main` the single source of truth (merge `ai-engineering` → `main`, point Vercel production at `main`, retire `lane/*`) | One branch that is always true; `main` is 500+ commits stale |
| O8 | Upload the 13 approved photos to `spot-photos` (blocks migration 046) | Bucket writes are refused for every client role by design |

## Done on `claude/jolly-hypatia-hj9vhp` (2026-09-24), not yet on production

Audit fixes A1–A6 (vote integrity, deadline, guest limits, SSRF, Realtime
coalescing, mobile app bar), playable `/demo/vote`, WhatsApp share + link
previews, Next.js RCE patch (16.3.6), `schema.sql` build fix, CI on every
branch, daily keep-alive, docs consolidation, README. Migrations **061** and
**062** are staged and verified on local Postgres; both need O4 approval.

**Remaining limit (owner decision):** 061 makes it one ballot per *account*,
not per person — a fresh guest session can still vote again. Options: cap
members per plan, or require a permanent account for the final round.

## Next — the portfolio pass

| # | Item | Size |
|---|---|---|
| B3 | **Venue photos via Google Places** (needs O3): Text Search → `websiteUri` → the venue's own `og:image` into our bucket, Places photo as fallback. Scoped in `docs/PLACES_INGESTION_SCOPE.md`; add `images.remotePatterns` (no wildcard, `security` review) | L |
| B4 | **Weather/heat** for the plan's date and area (Open-Meteo, no key) on the decided screen and as a deal signal | S |
| B5 | **Deal reveal + "Why this?" chips** — values already computed in the deal; deal nine on defaults first, form as refinement | M |
| B6 | Winner reveal: full-bleed photo when present, faces of who picked it, share card | M |

## Scale and hygiene

| # | Item | Size |
|---|---|---|
| C1 | `ensure_authenticated_profile` runs on every page view — call once per session | S |
| C2 | Cache the spot catalog (static, re-read per request; per-request CSP nonce forces dynamic rendering) | M |
| C3 | Split the oversized files (plan page → hooks + panels, `lib/social.ts` → people/invites/visits/collections, `AccountViews` → one file per tab, `globals.css` → imports) | M |
| C4 | Migrations: 57 flat files, CI tests only `schema.sql` (a replay log). Adopt `supabase/migrations/`, squash to a baseline from production, `supabase db reset` in CI | M |
| C5 | Realtime DELETE may reveal other plans' ids when a community spot is deleted — confirm with `scripts/load/realtime-fanout.mjs`; refuse deleting a spot in live plans | S |
| C6 | `test:e2e` off in CI — point it at a throwaway plan and turn it on; one real load pass against the deployment | M |

## Later — "never leave the app"

Open-now from `open_till` against the Dubai clock · travel time beyond
straight-line distance · real moodboards on migration 036's tables (demo is
localStorage) · Ramadan/iftar-aware hours · Arabic/RTL · Instagram/social links
on the place page · booking handoffs. Deliberately not yet: taste profiles and
year-in-review features — they need usage data the app does not have.
