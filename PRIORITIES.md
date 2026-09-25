# Priorities

**Read when:** starting a session, or deciding what to do next. The queue only —
detail lives in the code, `worklog.md`, and `docs/`. Previous long-form version:
`docs/archive/PRIORITIES-2026-09-18.md` (full reversibility audit, scale notes,
backlog reasoning).

Legend: `S` under a day · `M` a day or two · `L` more.

## Waiting on the owner

| # | Item | Why it matters |
|---|---|---|
| O1 | **Push the unpushed local commits**: `git push origin ai-engineering` from the laptop (production runs `d536b6f`, not on GitHub). Contains a Turnstile fix (challenge that never paints, seen live on `/login` 2026-09-20) that exists nowhere else; the card-reason change is superseded by the "Why this?" chips. Then merge `ai-engineering` into `main` | The live code exists only on one machine |
| O2 | **Turnstile:** add `plan-ind.vercel.app` to the widget's hostnames; put the secret key in Supabase → Auth → Attack Protection | Production sign-in and guest voting are impossible until both are done (`docs/DEPLOYMENT.md`) |
| O3 | **Google Places API key** — Places API (New) only, budget alert set, `GOOGLE_PLACES_API_KEY` (server-only, never `NEXT_PUBLIC_`). The pipeline is built; the 5-step runbook is at the end of `docs/PLACES_INGESTION_SCOPE.md` | Venue photos — the biggest visual gap (6 of 82 venues have one) |
| O4 | **Migrations 049, 051, 061, 062, 063 (+064 when staged) — APPROVED by the owner 2026-09-25.** Blocked only on access: add `api.supabase.com` + `*.supabase.co` to the environment's network allowlist and `SUPABASE_ACCESS_TOKEN` (personal access token, revoke after) as an env var; a new session then applies them in order via the Management API and verifies each by catalog query. Back up votes/rsvps/ratings before 061 | Approved; needs a way in |
| O5 | **Keep the database awake**: a daily `/api/health` ping is committed (`.github/workflows/keepalive.yml`) and starts once it reaches `main`; Supabase Pro removes the risk entirely | A paused DB is a dead CV link |
| O6 | **Cloud-session network access**: allow `*.supabase.co`, `plan-ind.vercel.app`, `api.open-meteo.com` | Lets sessions verify against live instead of guessing |
| O7 | `main` is now the source of truth (fast-forwarded 2026-09-25; `vercel.json` keeps it from auto-deploying). Left for the owner: delete the fully merged `lane/backend`, `lane/frontend`, `lane/qa`, `lane/design` (branch deletion needs owner permission), and point Vercel production at `main` when going live | One branch that is always true |
| O8 | Upload the 13 approved photos to `spot-photos` (blocks migration 046) | Bucket writes are refused for every client role by design |

## Done on `claude/jolly-hypatia-hj9vhp` (2026-09-24), not yet on production

Audit fixes (vote integrity, deadline, guest limits, SSRF, Realtime
coalescing, mobile app bar, honest vote errors) · playable `/demo/vote` and a
deal-reveal preview on `/demo` · WhatsApp share + per-plan link previews ·
weather/heat on the decided plan · "Why this?" chips · skeleton loading ·
catalogue cache + one profile write per account (landing 1 → 0 DB reads) ·
Google Places pipeline, key-ready · every `.ts/.tsx` under 500 lines, CSS in
ordered partials · Next.js RCE patch (16.3.6) · `schema.sql` builds again ·
CI on every branch · daily keep-alive · docs consolidation · README.
Migrations **061–063** are staged and verified on local Postgres (O4).

**Owner decision 2026-09-25: sign in from the start.** Joining or voting on a
plan requires a permanent account (email code or Google); anonymous guests are
gone. That closes the private-window re-vote that 061 alone could not.
Migration 064 + the client change are in progress.

## Next — the portfolio pass

| # | Item | Size |
|---|---|---|
| B3 | **Venue photos** (needs O3): run the Places runbook, upload approved photos, then render the per-request Google photo fallback + attributions on cards (`/api/spots/[id]/photo` exists; UI not wired) | M |
| B6 | Winner reveal: full-bleed photo when present, faces of who picked it, share card | M |

## Scale and hygiene

| # | Item | Size |
|---|---|---|
| C4 | Migrations: 57 flat files, CI tests only `schema.sql` (a replay log). Adopt `supabase/migrations/`, squash to a baseline from production, `supabase db reset` in CI | M |
| C5 | Realtime DELETE may reveal other plans' ids when a community spot is deleted — confirm with `scripts/load/realtime-fanout.mjs`; refuse deleting a spot in live plans | S |
| C6 | `test:e2e` off in CI — point it at a throwaway plan and turn it on; one real load pass against the deployment | M |

## Later — "never leave the app"

Open-now from `open_till` against the Dubai clock · travel time beyond
straight-line distance · real moodboards on migration 036's tables (demo is
localStorage) · Ramadan/iftar-aware hours · Arabic/RTL · Instagram/social links
on the place page · booking handoffs. Deliberately not yet: taste profiles and
year-in-review features — they need usage data the app does not have.
