# Priorities

T0's work queue. It is the one place that holds "what matters most" — without
it every session re-derives priority and the owner's actual concern loses to
whatever is technically loudest.

**Legend:** `S` under a day · `M` a day or two · `L` more than that.

---

## Wave — full control, dispatched 2026-09-17

Owner, 2026-09-16: users must *"find and navigate everything so easily"*, with
**configuring, managing and deleting** all on the table. Scoped as **full
control over your own stuff**: anything you can create, you can change and
delete. It's finite, and nothing in the app should be a dead end. Easy and
fun come *after* this (usability pass, then a few delight moments), not
interleaved. **Not** "more features": the owner also asked for no clutter.

**Rules for the wave:** T1 sends the *shape* of every RPC before writing SQL.
Migrations stay staged; any live apply is an owner go. Every item ships with a
T3 round-trip test that **does the action, undoes it, and asserts the world is
back**. A test that only checks a button was clickable doesn't count.

**First, before new work: T2 re-walks the full two-person flow on current
HEAD.** The last walk predates the dealing fix, the host name skip and the
auth-origin changes.

| # | Item | T1 backend | T2 frontend | Size |
|---|---|---|---|---|
| **C1** | **Friends: invite / accept / remove** | Live (048) | `wip/friend-invites` → two-account test + `security` review → merge | S |
| **C2** | **Settings page:** edit name and emoji, sign out, entry point to C3/C4 | Confirm the profile update path exists; add one if not | Build | S |
| **C3** | **Delete my account** | Shape first. Cascade across people, visits, companions, visit photos **and their storage objects**, votes/rsvps/ratings, friendships, invites, collections, moodboards. **Open question for the owner:** what happens to plans *they host* that other people have voted on. There's no service-role key, so deleting the `auth.users` row needs a definer design | Confirm dialog naming exactly what goes | L |
| **C4** | **Fix a wrong birthday** | Shape first. The write-once rule stays for age integrity; propose a bounded correction path | Build | M |
| **C5** | **Edit a plan before voting starts:** rename, change the deadline | Extend `execute_plan_command` or a new RPC; host only; refused once voting begins | Build | M |
| **C6** | **Leave a plan** (non-host) | Remove own access + own picks; host can't leave their own plan (they delete it instead) | Build | M |
| **C7** | **Reopen a decided plan** (host) | New command; decide what happens to RSVPs, carpool and booking | Build | M |
| **C8** | **Been: edit a visit, remove a rating, delete photos and collections** | Unrate RPC (`p_stars` is 1–5 only); photo delete **must remove the storage object**, not just the row; collection delete | Build | M |
| **C9** | **Undo** on quick reversible actions (untag, remove from a collection, unvote) in place of confirm dialogs | n/a | Build; destructive/irreversible actions keep confirms | S |

**Must fix before public launch — migration 053 (found 2026-09-17):**
`cast_plan_vote`, `set_plan_rsvp` and `rate_plan` let a caller who presents a
legacy row's `participant_token_hash` claim or overwrite that row, because the
guard only fires when `user_id` is not null, and the hash is readable by
co-members. Bounded: 45 legacy rows (25 votes, 17 RSVPs, 3 ratings), all
`user_id is null`, on the 6 pre-043 plans, and live has 0 accounts. Held out of
the full-control wave so the core voting loop isn't rewritten mid-wave. Fix:
refuse writes to `user_id is null` rows, with its own rehearsal. Alternative
(owner's call, live data write): delete the legacy rows if the 6 plans are
confirmed test data.

**T3 owns the round trips** for C1–C9, plus the tests already queued: the
delete-plan dbtest, the allowed/limited/unavailable regression, the 13
`resolveAppOrigin` asserts, and the friendship-consent regression.

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

Integration, merges, CI, the dead-code sweep, owner interface. Holds the open
owner decisions (metallics question, migration 039's photo upload, Places
quota, the paused project, the hosting-tier decision below).

---

## Reversibility — audited 2026-09-16, and it is the biggest gap in the product

Owner, verbatim: *"sometimes a user might not be able to add an account or log
out because we only thought about the first part… every single feature has to
be able to be managed, reverted, and completed end to end."*

A full audit of every user-facing action against its inverse, checked at **four
layers** — database, lib, a control a real user can reach, and a test —
because this repo has shipped features where only the first two were true.

**The shape of the finding:** the forward path is built almost everywhere. The
return path is missing, or exists in the data layer and reaches no screen.

| Rank | Gap | Layer that breaks | Owner |
|---|---|---|---|
| **R1** | **A plan can never be cancelled or deleted.** No policy, no command, no UI, at any layer. The highest-traffic action in the product has no undo — a mis-created plan is permanent for everyone in it. | all four | T1 → T2 |
| **R2** | **DOB is write-once with no recovery path.** One typo permanently mis-gates a real user's venue access, with no self-serve or admin fix. The write-once rule is deliberate and correct for age integrity; having *no* recovery is not. | all four | T1 |
| **R3** | **No account deletion.** Not merely a UX gap — a GDPR/App-Store exposure the moment this launches city-wide. | all four | T1 → T2 |
| **R4** | ⚠️ **CORRECTED 2026-09-16, and it became a security hold.** The audit's original claim — "`getFriends` is wired, so the tab can never have content" — was **wrong on both halves**: `getFriends` has zero callers, and the Friends tab is already populated from `getPlannedWith` (`app/home/page.tsx:67`). The real gap is that **friendships have no consented path to exist**: companions are stored as typed names with `person_id` null, and the "add own friendships" policy reportedly constrains `person_id` only, not `friend_id`, while a SECURITY DEFINER trigger mirrors the reverse row. **Do not wire `addFriend`.** Under `security` review; consent (request + accept) is schema work. | DB | T1, held |
| **R5** | **`removeFriend`, `deleteVisit`, `untagCompanion` all work and are unreachable.** The exact pattern the owner described, confirmed in three more places. | UI | T2 |
| **R6** | **Carpool (migration 035) is live in the database with no control at all** — its column is only ever preserved, never set or cleared. | UI | T2 |
| **R7** | **`decide` is terminal.** A wrong decision cannot be reopened; the group must abandon the plan and start over. | DB | T1 |
| **R8** | Rating cannot be removed (`p_stars` is 1–5 only); a visit cannot be edited; a collection cannot be deleted; an uploaded photo has a storage policy but no lib function. | mixed | T1 → T2 |

**T3 owns the round trips.** The E2E suite today tests forward paths almost
exclusively — the only inverse covered anywhere is vote withdrawal. Every item
above needs a test that performs the action *and undoes it*, and the test is
what makes the fix real.

**Sequencing:** R1–R3 are the ones that hurt a real user or expose us legally,
and they need backend work first. R4–R6 are pure wiring of things that already
exist, which makes them the cheapest real improvement available to T2.

---

## Scale and system design — what this app actually needs

The owner wants the system-design depth a city-scale product requires. What
follows is ranked by **this app's real failure modes**, not by technique
popularity. Items marked ⏳ are deliberately gated on T3's measurements —
building them before the number exists is how you optimise the wrong layer.

| # | Item | The actual problem it solves |
|---|---|---|
| **S1** | **Vote fan-out is N².** Every cast vote triggers *every connected client* to refetch the whole vote set for that plan. Fifty people on one plan is 50 writes × 50 refetches = 2,500 queries per round. Fix is to carry the tally in the Realtime payload, or coalesce/debounce the refetch, or aggregate server-side. ⏳ shape confirmed by T3 first. | **The single most likely thing to fall over at city scale.** T3 already flagged it ahead of WAL. |
| **S2** | **Connection ceiling.** Thousands of concurrent guests means Realtime connection caps and a Postgres connection pool, neither of which has ever been budgeted. Needs a measured per-client connection cost and a pooling check. ⏳ | Hard limits fail as refusals, not slowness — and this repo mistakes refusal for empty. |
| **S3** | **Hosting tier is a real decision, not a detail.** The live project **paused itself** — that is free-tier inactivity behaviour. A free tier will not hold a city under any amount of code cleverness. | Owner decision, and it gates every number T3 produces against live. |
| **S4** | **Catalogue caching.** 82 spots that change rarely, currently served `Cache-Control: no-store` like everything else. The clearest cache candidate in the codebase, with obvious invalidation (a migration or a photo backfill). | Not measurement-gated — the data is *obviously* static. Cheap, real, benchmarkable. |
| **S5** | **Graceful degradation when Realtime drops.** Today a dropped channel leaves a stale tally on screen with no indication it is stale. Fall back to polling and say so. | Same family as the repo's dominant bug: a screen that is confidently wrong beats one that admits it. |
| **S6** | **Edge rate limiting + bot protection.** App-level quotas exist (020/022/030); nothing stops abuse before it reaches a function. Turnstile is configured nowhere, and is a hard wall in production when it is. | A public share link is an open door by design. |
| **S7** | **Health + readiness endpoint.** No `/api/health` exists. Needed for uptime monitoring and any load balancer. | Missing outright. Cheap. |
| **S8** | **Photo ingestion as a background job.** The first genuinely async workload in the product — until now the board correctly said queues solved nothing here. That changes with P1.1. | Justified by a real workload, finally. |
| **S9** | **Index review of hot paths under measured load**, and an idempotency sweep of the write RPCs other than `cast_plan_vote` (023 covered votes only). | Concurrency-safety, where it is actually reachable. |
| **S10** | **Timeouts and circuit-breaking on every external call.** Done for OpenAI (`maxRetries: 0`, 30s). Places is next and must ship with the same discipline. | An SDK default already nearly held a serverless invocation open for half an hour. |

**The rule that governs this whole section:** every item names a problem this
app actually has, and ships with a before/after number where the claim is
performance. Nothing here gets built because it appears on a list of
techniques — that is the failure mode the owner has warned about twice.

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
