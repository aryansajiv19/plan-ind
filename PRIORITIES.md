# Priorities

**Read when:** starting a session, or deciding what to do next. The queue only —
detail lives in the code, `worklog.md`, and `docs/`. Previous long-form version:
`docs/archive/PRIORITIES-2026-09-18.md` (full reversibility audit, scale notes,
backlog reasoning).

Legend: `S` under a day · `M` a day or two · `L` more.

## Live

`main` auto-deploys to https://plan-ind.vercel.app (docs-only commits skip
the build). Migrations through 081 are live; 082, 083 and 084 are staged (owner approval).
Everyone signs in (064). One CV link: the landing's "Try it, no sign-up" runs
the whole journey on /demo/vote with sample data.

## Now (2026-09-28, owner away; three sessions: lead + B platform + C journey)

Plan: `~/.claude/plans/rippling-puzzling-donut.md`. Lanes hand off to the
lead, who reviews, gates and merges; migrations are staged, security-reviewed,
then applied only with the owner's yes.

Done today: desert palette + Cormorant italic + night sky with stars and
glints; shared nav everywhere; photo tiles; Luna leads the composer; host
removes a member (080); folders (081); custom-place edit/delete; saved-link
remove; live route map (fallback until the key); reminders, leave-by, cost per
head; For you; Tonight/At a glance; story share cards; Discover constellation
map; UX-audit pass; hooks hardening (silent failures, vote ordering); client
error reporting; demo journey; Tresind photo swapped.

Next: visual baselines regenerated (in progress), E2E for today's features (C),
match.ts split (B), then the owner's decisions below.

## Waiting on the owner

| # | Item | Why it matters |
|---|---|---|
| O2 | Supabase Auth: anonymous sign-ins **off**, then the Turnstile secret, then the Google provider | Closes free guest sessions and the Luna quota drain |
| O4 | Google Cloud: a browser key restricted by referrer to Maps JavaScript API + Routes API, set as `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` in Vercel; per-API daily quotas; a ~$20 budget alert | Live route map with real metro steps |
| O7 | Apply staged migrations 082 (freeze an in-plan custom spot's details; revoke stray grants), 083 (member photo quota 40/min, 150/day) and 084 (a pg_cron job that closes overdue plans every 5 min). All security-reviewed, all on main | A bait-and-switch Low; members not hitting the photo limit; plans that decide on time with nobody online |
| O8 | Catalogue growth: run `npm run places:discover` (prints cost, calls nothing), then one cell, then the grid (~$0 in the free tier, worst case ~$16) and review the CSV | 76 venues is the biggest product gap |
| O6 | Housekeeping: delete merged `lane/*` branches; delete the unreferenced Tresind object from the spot-photos bucket | One branch that is always true |

## Roadmap (product audit 2026-09-27, detail in `docs/ROADMAP.md`)

Owner goal: complete end to end, "oh wow" to use, and no question that sends
someone back to the group chat. P-numbers match `docs/ROADMAP.md`.

| Phase | Items | Lanes |
|---|---|---|
| 1. Broken and dead ends | DONE (all but P10, photos) | frontend, server, backend-sql |
| 2. Never ask a friend | DONE but P22 (075 staged, client on `lane/frontend-booking`) and P24 live routes/hours (blocked on O3 and O4) | frontend, backend-sql |
| 3. Interface wow | DONE: P25, P26, P27, P29, P30, P31, B8. Left: P28 photos + "right now" on the landing (prep merged, waits on O3) | frontend, server |
| 4. Coverage and hygiene | DONE: P33, P34. Left: P32 Places ingestion (O3), P35 copy/duplicate cleanup | all |

Perf (2026-09-27): hero paints before hydration, own photos optimised, account
views lazy. Numbers in the worklog.

Recorded, not built (fine at tens of users): Discover scan cost at 100k custom
spots; unindexed `user_id` FKs; 1000-row PostgREST cap on vote reads;
unbounded per-user lists; global Luna/photo caps drainable by ~10 real
accounts; R10 OTP-limit lockout of a known email until 00:00 UTC; C2 client
IP to GoTrue (needs a secret key the repo never holds). Migration 066
(control secret sha256) is optional.

## Scale and hygiene

| # | Item | Size |
|---|---|---|
| C4 | Migrations: adopt `supabase/migrations/` from a **baseline dumped from production** (`supabase db dump --linked`, needs the owner's DB password or `supabase login`) plus `migration repair` on live; then `supabase start` in CI. Never use `schema.sql` as the baseline: it DROPs every table if `db push` ever runs it. Owner to decide: retire `schema.sql` or keep it as a generated snapshot | M |

## Later — "never leave the app"

Ramadan/iftar-aware hours · Arabic/RTL · Instagram/social links on the place
page · booking handoffs. (Open-now, drive estimates and persisted moodboards are
done.) Deliberately not yet: taste profiles and
year-in-review features — they need usage data the app does not have.
