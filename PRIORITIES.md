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
| O4 | **Approve live migrations**: 049 + 051 (hide `user_id` columns), then 061 once reviewed | Every live DB write is an owner decision |
| O5 | **Keep the database awake**: the free Supabase tier pauses on inactivity and has done so once. Either Supabase Pro, or approve a daily health-ping cron | A paused DB is a dead CV link |
| O6 | **Cloud-session network access**: allow `*.supabase.co`, `plan-ind.vercel.app`, `api.open-meteo.com` | Lets sessions verify against live instead of guessing |
| O7 | Make `main` the single source of truth (merge `ai-engineering` → `main`, point Vercel production at `main`, retire `lane/*`) | One branch that is always true; `main` is 500+ commits stale |
| O8 | Upload the 13 approved photos to `spot-photos` (blocks migration 046) | Bucket writes are refused for every client role by design |

## Now — correctness and security (2026-09-24 audit)

| # | Item | Size |
|---|---|---|
| A1 | **Ballot stuffing:** `cast_plan_vote` keys a vote on a caller-chosen participant hash, so one session can cast unlimited votes. Key votes/RSVPs/ratings on `user_id`; clean `voter_name` with `clean_display_name` → migration 061 | S |
| A2 | Deadline is shown but not enforced server-side → 061 | S |
| A3 | Guests can burn the global smart-search cap; guest uploads to storage are unlimited → refuse anonymous sessions | S |
| A4 | Place-import SSRF: DNS check validates one address, fetch re-resolves; missing IPv6/NAT64 ranges | S |
| A5 | Realtime fan-out: every vote makes every subscriber refetch all rows (N² per plan) → coalesce refetches | S |
| A6 | Mobile app-bar: tab strip overlaps logo/search at 390px | S |

## Next — the portfolio pass

| # | Item | Size |
|---|---|---|
| B1 | **Playable demo:** `/demo`'s "See a sample vote" dead-ends. A fixture-driven deal → vote → reveal a recruiter can finish without an account | M |
| B2 | **WhatsApp-first sharing:** per-plan `generateMetadata` + OG image (plan page is client-only today), `wa.me` button beside copy-link | M |
| B3 | **Venue photos via Google Places** (needs O3): Text Search → `websiteUri` → the venue's own `og:image` into our bucket, Places photo as fallback. Scoped in `docs/PLACES_INGESTION_SCOPE.md`; add `images.remotePatterns` (no wildcard, `security` review) | L |
| B4 | **Weather/heat** for the plan's date and area (Open-Meteo, no key) on the decided screen and as a deal signal | S |
| B5 | **Deal reveal + "Why this?" chips** — values already computed in the deal; deal nine on defaults first, form as refinement | M |
| B6 | Winner reveal: full-bleed photo when present, faces of who picked it, share card | M |
| B7 | README, screenshots and a short architecture note for recruiters | S |

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
