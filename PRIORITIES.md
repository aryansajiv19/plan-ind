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

## Roadmap (product audit 2026-09-27, detail in `docs/ROADMAP.md`)

Owner goal: complete end to end, "oh wow" to use, and no question that sends
someone back to the group chat. P-numbers match `docs/ROADMAP.md`.

| Phase | Items | Lanes |
|---|---|---|
| 1. Broken and dead ends | ~~P2~~ done; P4 server done (069), client pending; P3 "Your plans" rail; P5 deal failure says "raise your budget"; P6 dead budget/radius options; P7 signed-out composer refuses after typing; P8 preview ignores the visitor's settings; P9 place details from cards; P10 Google photo route has no caller; P11 rating before the outing logs a fake visit; P12 direct-plan form; P13 account read/write errors; P14 Settings incl. account deletion; P15 host can cancel a decided plan; P1 B8 landing | frontend, server, backend-sql |
| 2. Never ask a friend | **070 catalogue truth: 4 closed venues still dealt live** (data/venue-facts.json); P16 directions per viewer (drive, metro, walk, Uber); P17 nearest metro + walk; P18 your own distance on cards; P19 coordinates for all 82; P20 "know before you go" facts; P21 "When" at creation; P22 carpool/booking as coordination; P23 time picker + calendar; P24 live routes/hours (key) | frontend, data, backend-sql |
| 3. Interface wow | P25 content-first composer; P26 reveal the real nine; P27 media band on vote cards; P28 photos + "right now" on landing; P29 payoff before sign-up; P30 honest demo; P31 share-and-return loop | frontend, server |
| 4. Coverage and hygiene | P32 Places ingestion; P33 E2E for create, lifecycle, last mile; P34 DB tests, retire verify-journey; P35 copy/duplicate cleanup | all |

## In flight (paused 2026-09-26 evening)

The review batch is **done and merged**: server fixes, client fixes, 067/068
(staged) and their follow-up fixes F1–F6. Left: two partly-closed fixes the
confirmation pass found (F1 upload burst, F2 name squat; see the worklog
checkpoint; both in unapplied 067/068, so they block go-live), and **B8** (landing redesign, frontend lane, WIP on
`lane/frontend-a`). Then go-live on the owner's word. Go-live applies 064, 067, 068, 069 in order.

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
