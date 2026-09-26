# Priorities

**Read when:** starting a session, or deciding what to do next. The queue only —
detail lives in the code, `worklog.md`, and `docs/`. Previous long-form version:
`docs/archive/PRIORITIES-2026-09-18.md` (full reversibility audit, scale notes,
backlog reasoning).

Legend: `S` under a day · `M` a day or two · `L` more.

## Waiting on the owner

| # | Item | Why it matters |
|---|---|---|
| O2 | **Go-live prerequisites:** put the Turnstile **secret** in Supabase → Auth → Attack Protection (the hostname was added 2026-09-20, but the secret is not set, so captcha is not enforced server-side); enable the **Google** provider in Supabase Auth (live: `google: false`, so email code only) | Sign-in is the front door after 064 |
| O3 | **Google Places API key** — Places API (New) only, budget alert set, `GOOGLE_PLACES_API_KEY` (server-only, never `NEXT_PUBLIC_`). The pipeline is built; the 5-step runbook is at the end of `docs/PLACES_INGESTION_SCOPE.md` | Venue photos — the biggest visual gap (6 of 82 venues have one) |
| O4 | **Say "go live"**: the lead then applies 064 (the last staged migration), removes `main: false` from `vercel.json`, deploys `main`, and verifies sign up → create → share → vote → decide on the live URL. 049/051/061/062/063/065 are live | 064 breaks guest links on the old client, so it ships with the deploy |
| O5 | **Keep the database awake**: a daily `/api/health` ping is committed (`.github/workflows/keepalive.yml`) and starts once it reaches `main`; Supabase Pro removes the risk entirely | A paused DB is a dead CV link |
| O6 | **Cloud-session network access**: allow `*.supabase.co`, `plan-ind.vercel.app`, `api.open-meteo.com` | Lets sessions verify against live instead of guessing |
| O7 | `main` is now the source of truth (fast-forwarded 2026-09-25; `vercel.json` keeps it from auto-deploying). Left for the owner: delete the fully merged `lane/backend`, `lane/frontend`, `lane/qa`, `lane/design` (branch deletion needs owner permission), and point Vercel production at `main` when going live | One branch that is always true |
| O8 | Upload the 13 approved photos to `spot-photos` (blocks migration 046) | Bucket writes are refused for every client role by design |

## Done on `main` (2026-09-24/26), not yet on production

Audit fixes (vote integrity, deadline, guest limits, SSRF, open redirect,
Realtime coalescing, mobile app bar, honest errors) · sign-in from the start ·
playable `/demo/vote` + deal reveal · WhatsApp share + link previews that
announce the winner · weather/heat · in-app map, open-hours, drive estimate ·
"Why this?" chips · persisted moodboards · catalogue cache · Google Places
pipeline, key-ready · no `.ts/.tsx` over 500 lines · Next.js RCE patch ·
`schema.sql` builds again · CI on every branch · E2E runs locally (183 pass) ·
keep-alive · docs consolidation · README. Migrations 061/062/063/065 live 2026-09-26; 064 waits for go-live (O4).

**Owner decision 2026-09-25: sign in from the start.** Joining or voting on a
plan requires a permanent account (email code or Google); anonymous guests are
gone. That closes the private-window re-vote that 061 alone could not.
Done: migration 064 (staged) + the client gate on `main`.

## Next — the portfolio pass

| # | Item | Size |
|---|---|---|
| B3 | **Venue photos** (needs O3): run the Places runbook, upload approved photos, then render the per-request Google photo fallback + attributions on cards (`/api/spots/[id]/photo` exists; UI not wired) | M |
| B6 | Winner reveal: full-bleed photo when present, faces of who picked it, share card | M |

## Scale and hygiene

| # | Item | Size |
|---|---|---|
| C4 | Migrations: 57 flat files, CI tests only `schema.sql` (a replay log). Adopt `supabase/migrations/`, squash to a baseline from production, `supabase db reset` in CI | M |
| C6 | E2E runs locally (recipe in `tests/README.md`); turn it on in CI by pointing the job's env at the stack it starts; one real load pass against the deployment | M |
| C7 | Generate visual baselines after the cinematic pass (32 visual specs skip without them) | S |

## Later — "never leave the app"

Ramadan/iftar-aware hours · Arabic/RTL · Instagram/social links on the place
page · booking handoffs. (Open-now, drive estimates and persisted moodboards are
done.) Deliberately not yet: taste profiles and
year-in-review features — they need usage data the app does not have.
