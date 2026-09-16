# Priorities

T0's work queue. It is the one place that holds "what matters most" — without
it every session re-derives priority and the owner's actual concern loses to
whatever is technically loudest.

**Legend:** `S` under a day · `M` a day or two · `L` more than that.

---

## Wave — dispatched 2026-09-16

Ranked by `DESIGN_DIAGNOSIS.md`'s corrected finding: the app doesn't feel like
Dubai because **there is nothing to show**, not because of its colours. Plus
the owner's scale requirement — real traffic, on the web, has to hold up.

### T1 — Backend / Security

| # | Task | Why | Size |
|---|---|---|---|
| **P1.1** | **Venue photography pipeline.** `PLACES_INGESTION_SCOPE.md` is already written — read it, don't re-derive it. 6 photos across 82 venues is the single largest gap in the product. Free sources only; no paid Places API (owner's call, 2026-09-04). | Everything below #2 is downstream of this | L |
| **P1.2** | **Photo storage + serving path.** Where the bytes live, how `photo_url` gets populated, and the `next.config.ts` `images.remotePatterns` decision that currently forces every `next/image` to `unoptimized`. `security` subagent on the host allowlist — no wildcard. | The app's heaviest asset class, currently unoptimised | M |
| **P1.3** | Fix what T3's load work surfaces — indexes, N+1s, connection limits, RPC hot spots. **Only once measured.** | Owner's scale requirement | M |
| **P1.4** | `verifyEmailCode` OTP brute-force throttle (cross-lane request, open). | Real auth gap | S |

### T2 — Frontend

| # | Task | Why | Size |
|---|---|---|---|
| **P2.1** | **Faces and presence.** The plan already knows its members; §26.1's held seats work today. **The only priority item needing no new content**, and the *social* half of what the owner asked for is about people, not photographs. | Actionable immediately, nothing blocks it | M |
| **P2.2** | 🟡 `setRsvp()` carpool-field fix — one line, but migration 035 is live and every ordinary RSVP tap currently nulls out a carpool answer. See cross-lane requests. | Live data loss, tiny fix | S |
| **P2.3** | **Ungate the feed** — `app/home/page.tsx:26` `requireUser()` + `:29` DOB redirect mean nobody sees a Dubai venue without an account. Discover is *already* feed-shaped (a 120-row grid with search + filters), so this is an ungating, not a rebuild. **Sequence after P1.1 lands** — a browse-first door onto photo-less venues is a thin directory. | Cheap, high leverage, but only once there's something to see | M |
| **P2.4** | **Deal nine on defaults immediately**, configuration as refinement. **Do not delete the configuration** — the curated nine *is* the product's value. Make the wait for the reward zero, not the effort zero. | Reward before effort | M |
| **P2.5** | `/login` focus indicator: `layout-consistency.spec.ts` reports control 2 has `outlineStyle: none, boxShadow: none`. A keyboard user cannot see where they are on the sign-in form. | Real a11y defect, pre-existing | S |

### T3 — QA / Scale

| # | Task | Why | Size |
|---|---|---|---|
| **P3.1** | **Prove the app holds thousands of concurrent users.** Not the front-door baseline already measured — the real loop: many clients on one plan, voting, with Realtime attached. Report p50/p95/throughput/error-rate. Paired alternating reps, never sequential A-then-B. | The owner's explicit requirement | L |
| **P3.2** | **Realtime at fan-out.** Migration 045 fixed silently-dropped DELETEs; nothing measures what happens with hundreds of subscribers on one plan. `replica identity full` writes the whole old row to WAL — cheap at 136kB, unknown at scale. | The most likely thing to break first | M |
| **P3.3** | **Turnstile test tension, needs a decision.** Guest/vote specs *require* `NEXT_PUBLIC_TURNSTILE_SITE_KEY`; runtime-health's `/login` *breaks* with it (the widget never settles headless, `page.goto` never reaches load). Fix belongs in the spec — `waitUntil: "domcontentloaded"`. | Both cannot currently be satisfied in one invocation | S |
| **P3.4** | `test:security` and `test:wrapped` are plain aliases for `npm test` and filter nothing — the names promise coverage they don't give. | A green `test:security` is misleading | S |
| **P3.5** | Expand concurrency/integration coverage as you go, not just load. | Owner asked for coverage kept up | M |

### T0 — Lead

Integration, merges, CI, the dead-code sweep, owner interface. Holds the two
open owner decisions (metallics question, migration 039's held photo upload).

---


# Backlog — real, queued, not this wave

## Direct plan — skip the vote, owner feature, 2026-09-04

**The core loop assumes a group deciding between options. Sometimes there's no
decision to make** — one person already knows the place, or has a saved
shortlist, and wants to lock it in directly rather than deal-and-vote through
three rounds. This is a second entry point into the product, not a variant of
the existing one.

**What it shows, per the owner's list, checked against what already exists:**

| Detail | Status |
|---|---|
| Budget | **Already have the data** — `spots.min_spend`/`price_band`. Display work, not new data. |
| Age limit | **Already have the data** — `spots.minimum_age` + the category thresholds already enforced everywhere else. Display work. |
| Weather | **Not built, but free and unblocked** — Open-Meteo, verified working with no API key (`NEXT_AGENT.md`), independent of the AI/B3 blocker. Real add. |
| Is it open (right now) | **Partially free** — `spots.open_till` exists but is a static daily closing time, not live hours; "open right now" can be *approximated* for free against the Dubai clock already in the codebase. A real live-hours source is the same kind of paid-API decision as the photo one — flag before building past the approximation. |
| Transportation to get there | **Resolved 2026-09-04 — "Getting there," free version, see `Venue-link enrichment` below.** Straight-line distance + "Open in Maps" (which already surfaces live RTA metro/bus/taxi data). A direct RTA API integration is a real future item, not scoped work yet — see that section for what was actually checked. |
| Carpool coordination → reframed as "who's driving" | **Owner-clarified 2026-09-04**: this is *not* the transportation-timing feature (that's the row above) — it's specifically the lightweight "who's driving, who needs a ride" coordination list, unaffected by the RTA finding. **Green-lit, Design's original §10.2 proposal in `design-system/SPECS.md` stands**: extend `rsvps` with `transport`/`seats_available`, a plain sorted list on the payoff screen, no matching/optimization. Backend can build `create_direct_plan`'s sibling RPC extension now that scope is confirmed. |

**The flow itself:** `app/place/[id]/page.tsx` (already shipped, honest/scoped
version) is the right surface for the detail view.

**✅ Backend checked the creation path, 2026-09-04 — clear answer.** Schema
needs no migration: `pool_count`'s check already allows 1, `stage`/`status`
already allow `'decided'`, `winner_spot_id` is a plain nullable FK settable at
creation. But `create_secure_plan` itself can't do it — `status`, `stage`, and
`pool_count` are hardcoded (not parameterized) in its INSERT, plus a hard
`cardinality(p_spot_ids) <> 9` rejection up front. **Needs a new RPC**
(`create_direct_plan`), mirroring `create_secure_plan`'s auth/age/ownership
checks with cardinality=1 and the direct-case values. Small, well-scoped, no
schema migration — just a new function + grants.

**Bonus finding:** everything downstream already works unmodified. The
decided-view gate is purely `status === 'decided'` + `winner_spot_id`, no
vote-history dependency; `execute_plan_command`'s `patch` command (event time,
booking owner, booked — the carpool-adjacent fields) has zero stage/status
precondition. Post-creation coordination needs nothing new regardless of how
a plan reached `'decided'`.

**Assigned:** Design specs the flow + the carpool scoping question — Backend's
`create_direct_plan` is ready to build the moment that spec lands; Frontend
builds after both.
Queued behind current work, not urgent-urgent, but real and named.

## Venue-link enrichment — owner priority feature, 2026-09-04

**Paste a link → get the full venue: photos, distance, how to get there.**
This is largely **unbuilt, not broken** — a full architecture already exists
in `PLACE_IMPORT_ARCHITECTURE.md` (dated 2026-08-07) and its schema is live
(migration 012: `place_imports`, `place_collections`, `place_collection_items`,
owner-scoped RLS). What exists today: `PlaceLinkImporter.tsx` (UI shell,
localStorage-only preview), `app/api/place-import/route.ts` + `lib/place-import.ts`
(URL validation/normalization for Instagram/TikTok/Facebook/Reddit/YouTube/web,
tracking-param stripping, credential/malformed-link rejection). **The endpoint
does not fetch anything and nothing persists to Supabase yet** — intentional,
per the doc, pending the resolution pipeline below.

The doc's 7-step pipeline (intake → permitted-source fetch → clue extraction →
candidate matching against the `spots` catalog → confidence resolution →
enrich/reconcile → present/save) and its security rules (allowlisted provider
adapters only, **never a generic server-side fetch of an arbitrary URL**, block
private IPs/oversized responses, treat all fetched content as untrusted) are
already specified — read that file before building, don't re-derive it.

**Both scope decisions resolved by the owner, 2026-09-04 — free version for both, revisit later:**
1. **Travel time/directions → free version, build it.** Straight-line distance
   via `origin_latitude/longitude` ↔ `spots.latitude/longitude` (pure math,
   live now) + an "Open in Maps" deep link. **Researched, not assumed**: a
   direct RTA API integration for in-app metro/bus/taxi timings is not the
   simple free thing it first looked like — RTA's GTFS feed is real but its
   real-time/detailed access goes through Dubai's government data-exchange
   portal (`data.dubai`, formerly Dubai Pulse), described as "restricted to
   government entities and authorized users," not a public self-serve key;
   the Transitland-mirrored GTFS feed is also stale (last real update 2021).
   **The Maps deep link already covers the actual ask for free**: Google Maps
   in Dubai renders RTA's live bus/metro data directly (RTA publishes it
   there itself, confirmed via search — Dubai was the first Middle East city
   to do this), so "see transit timings" is one link tap away without us
   integrating anything. A real in-app RTA integration is a genuine future
   item — needs someone to actually go through the registration process and
   find out real terms — not scoped as buildable work yet.
2. **Photos → free version, build it.** Match against the curated `spots`
   catalog's existing `photo_url` (mostly null today) or the provider's own
   embed metadata. Paid Places-photo API **deliberately deferred** — owner:
   skip paid APIs for now, will get a Google Places API key later. Revisit
   `next.config.ts`'s `images.remotePatterns` decision once that happens (not
   before — a `security` subagent look at the specific host is required per
   the standing rule against a wildcard allowlist).

AI/LLM-based clue extraction and matching (steps 3–5) are **blocked on B3**
(OpenAI credits still zero) for anything requiring a model call — but intake,
schema persistence, catalog-only matching, and the two items above don't need
one and can start now.

**Assigned:** Security/Backend leads (data pipeline + the SSRF/fetch-safety
rules are squarely their turf); Frontend picks up the enriched-result UI once
a real API contract exists, not before.

## Friends that can actually be added

Migrated from `NEXT_AGENT.md` §4.4, 2026-09-04 — real, unassigned, not
tracked here before now. `getFriends` works and is wired, but there is no way
to add a friend: `addFriend`, `removeFriend`, `areFriends`, `getPeople`,
`getSpotVisitors`, `getTaggedVisits`, `deleteVisit` and `untagCompanion` in
`lib/social.ts` all have zero callers — deferred waiting on this exact
feature, confirmed still accurate as of the 2026-09-04 dead-code sweep (not
dead, just unwired). Friendships currently only exist if someone writes them
by hand.

The natural source is companions already tagged on a visit, which `logVisit`
writes — give the Friends tab a way to turn a tagged companion who has an
account into a friendship. Not started; queued behind the current wave.

## Collections and moodboards, Pinterest style — owner feature, 2026-09-04

The layout direction for step 2/7's identified gap (`PRODUCT_FLOW.md`) —
Discover's moodboards and Been's post-visit photo collections, both currently
thin-to-no UI (moodboards are demo-only per Review's audit, Been is a flat log
with no grouping). Owner wants a Pinterest-style masonry/variable-height grid
for both, not a uniform card grid. **Design's call** to spec against the
`visit_photos`/`visit_collections`/moodboard data that already exists
(migration 010) — pairs naturally with the venue-link enrichment work above
once photos exist to populate it with. Not started; queued behind the
structural bug-fixes and the day/night palette correction.
