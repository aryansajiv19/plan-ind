# Priorities

**Read when:** starting a session, or deciding what to do next. The queue only —
detail lives in the code, `worklog.md`, and `docs/`. Previous long-form version:
`docs/archive/PRIORITIES-2026-09-18.md` (full reversibility audit, scale notes,
backlog reasoning).

Legend: `S` under a day · `M` a day or two · `L` more.

## Waiting on the owner

| # | Item | Why it matters |
|---|---|---|
| O2 | **Enable the Google provider** in Supabase Auth (live: `google: false`, so email code only). Have the **Turnstile secret** ready but do NOT set it yet: the live client mints guest sessions with no captcha token, so setting it early breaks every share link (see O4) | Sign-in is the front door after 064 |
| O3 | **Google Places API key** — Places API (New) only, budget alert set, `GOOGLE_PLACES_API_KEY` (server-only, never `NEXT_PUBLIC_`). The pipeline is built; the 5-step runbook is at the end of `docs/PLACES_INGESTION_SCOPE.md` | Venue photos — the biggest visual gap (6 of 82 venues have one) |
| O4 | **Say "go live"**. Cutover, in order: (1) apply 064 and deploy `main` together (remove `main: false` from `vercel.json`); (2) Supabase Auth: turn **off** anonymous sign-ins (`main` never calls them), then set the Turnstile secret; (3) verify sign up → create → share → vote → decide on the live URL. Until then free guest sessions can add ballots on a shared link (061 caps it at one per session) and can drain the day's Luna quota; both close at step 2 | The live-demo link |
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
| B6 | Winner reveal: full-bleed photo when present (faces + share: done 2026-09-26) | S |
| B8 | **Landing that isn't empty** (owner, 2026-09-26): visitor nav with anchors, a Dubai clock and a Start-a-plan CTA; a live looping mini vote in the hero (real components, sample group); How it works with real UI crops; a denser Dubai-right-now wall; real counts; a footer. Frontend lane. The biggest remaining lever is photography (O3 Places key) | M |
| B7 | **Host controls follow the account, not the device.** Today they need the host token in that browser's localStorage, so a host on a new device sees only "Leave this plan". Proposal: `execute_plan_command` (and edit/reopen/delete) also accept `auth.uid() = plans.created_by_user_id`; migration + `security` review + owner approval to apply | M |

## In flight (paused 2026-09-26 evening)

The review batch is **done and merged**: server fixes, client fixes, 067/068
(staged) and their follow-up fixes F1–F6. Left: two partly-closed fixes the
confirmation pass found (F1 upload burst, F2 name squat; see the worklog
checkpoint; both in unapplied 067/068, so they block go-live), and **B8** (landing redesign, frontend lane, WIP on
`lane/frontend-a`). Then go-live on the owner's word.

Recorded, not built (fine at tens of users): Discover scan cost at 100k custom
spots; unindexed `user_id` FKs; 1000-row PostgREST cap on vote reads;
unbounded per-user lists; global Luna/photo caps drainable by ~10 real
accounts (accepted residual after the cutover); R10 OTP-limit lockout of a
known email until 00:00 UTC (Supabase stays the one captcha verifier); C2
client IP to GoTrue (needs a secret key the repo never holds). Owner decision 2026-09-26:
under-age accounts cannot join a plan they are too young for (067, clear message).

## Scale and hygiene

| # | Item | Size |
|---|---|---|
| C4 | Migrations: adopt `supabase/migrations/` from a **baseline dumped from production** (`supabase db dump --linked`, needs the owner's DB password or `supabase login`) plus `migration repair` on live; then `supabase start` in CI. Never use `schema.sql` as the baseline: it DROPs every table if `db push` ever runs it. Owner to decide: retire `schema.sql` or keep it as a generated snapshot | M |

## Later — "never leave the app"

Ramadan/iftar-aware hours · Arabic/RTL · Instagram/social links on the place
page · booking handoffs. (Open-now, drive estimates and persisted moodboards are
done.) Deliberately not yet: taste profiles and
year-in-review features — they need usage data the app does not have.
