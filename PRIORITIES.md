# Priorities

**Read when:** starting a session, or deciding what to do next. The queue only —
detail lives in the code, `worklog.md`, and `docs/`. Previous long-form version:
`docs/archive/PRIORITIES-2026-09-18.md` (full reversibility audit, scale notes,
backlog reasoning).

Legend: `S` under a day · `M` a day or two · `L` more.

## Live

`main` auto-deploys to https://plan-ind.vercel.app (live since 2026-09-27;
docs-only commits skip the build). Migrations through 074 are live; 075 is
staged. Everyone signs in (064).

## Waiting on the owner

| # | Item | Why it matters |
|---|---|---|
| O1 | **"Yes, apply 075"** (any member can claim the booking; retires Scoopi Cafe and Garage Dubai, Iris to Lounge). Then merge `lane/frontend-booking` and `lane/platform-booking-e2e` | P22, the last "never ask a friend" gap |
| O2 | Supabase Auth: turn **off** anonymous sign-ins, **then** set the Turnstile secret, then the Google provider (OAuth client in progress) | Closes free guest sessions and the Luna quota drain |
| O3 | Approve the Places matches (dry run: 33 high, 34 review, 15 reject; review file in the lead's scratchpad, delete after) | P32 and P28: real photos on 76 venues; P24 live hours need the stored place ids |
| O4 | Enable the **Routes API** on the key's Cloud project (it returns SERVICE_DISABLED today) | P24 metro legs and drive time at the event hour |
| O5 | Keep or change the sign-street design experiment (`lane/frontend-exp`) | Direction for the rest of phase 3 |
| O6 | Housekeeping: delete merged `lane/*` branches; 13 photos for `spot-photos` (O8, may be superseded by Places) | One branch that is always true |

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
