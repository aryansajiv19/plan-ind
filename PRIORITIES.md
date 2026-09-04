# Priorities

The orchestrator's work queue. Ranked from the audit of 2026-08-28 (graphify +
three parallel explorers). Frontend leads, by owner decision.

Update this file when a wave completes. It is the one place that holds "what
matters most" — without it every session re-derives priority and the owner's
actual concern loses to whatever is technically loudest.

**Legend:** `S` under a day · `M` a day or two · `L` more than that.

---

## Owner-blocked — nothing in this repo unblocks these

State these every wave until resolved. They do not age out.

| # | Blocker | What it costs | What unblocks it |
|---|---|---|---|
| **B1** | Anonymous sign-ins disabled in Supabase Auth | **The entire share-link vote path is dead.** Post-020 every read needs a session; guests cannot get one. Nobody but a plan's creator can read or vote on a plan. | One dashboard toggle: Authentication → Sign In / Providers → Anonymous sign-ins. Pair with Turnstile CAPTCHA. |
| ~~**B2**~~ | ~~Migration 021 unapplied~~ | — | **Resolved 2026-09-01** — 021 (and 022, 023) applied live via the Supabase MCP by T0. Verified: `anon` can no longer call `valid_control_secret` / `execute_plan_command` / `consume_app_quota`. |
| **B3** | OpenAI credits exhausted | No AI behaviour verifiable — smart search, RAG, tool calling | Top up (~$0.0002 for the catalog backfill) |

B1 is now the only thing on this page blocking the core loop. `PRODUCT_STRATEGY.md`
names "excellent no-install share voting" as delivery item #1, and it is still
non-functional in production until B1 flips.

**Migrations 021 / 022 / 023 are LIVE** (T0, 2026-09-01, via Supabase MCP against
project `zyojaoyatunjwgbivaqu`). mig-023 file `42P13` bug fixed in `67a0ccf`.
Migration **024** (SEC.4) is written and staged, **pending owner approval to apply**.

**B1 is LIVE** — anonymous sign-ins enabled 2026-09-01.

**✅ 2026-09-01 — the guest vote path works end to end.** T2 verified against a
fresh browser profile: `/plan/[id]` → anon session → `claim_plan_access` → plan
reads → NameGate → cast a Round-1 vote → "selected" + live count bump. First time
the core product loop has functioned for a no-account guest. Delivery item #1 in
`PRODUCT_STRATEGY.md` is now real. Turnstile still off (deploy checklist).

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
| Transportation to get there | Ties to the travel-time scope decision already on record (`Venue-link enrichment` section below) — free straight-line + a maps deep-link, or a paid Directions API. |
| Carpool coordination | **Genuinely new — no schema, no concept anywhere today.** Needs a real scoping pass: is this a signup list (who's driving, who needs a seat) on the plan, or something lighter? Design's call to propose, not to assume. |

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

**Two pieces need explicit scope decisions before backend work starts — real
cost/complexity tradeoffs, not something to assume:**
1. **Travel time/directions.** Free version: straight-line distance via the
   `origin_latitude/longitude` ↔ `spots.latitude/longitude` columns that
   already exist (pure math, live now) + a "open in Maps" deep link (no API
   key). Real turn-by-turn/traffic-aware time needs a paid Directions API.
2. **Photos.** Free version: match against the curated `spots` catalog's
   existing `photo_url` (mostly null today) or the provider's own embed
   metadata. Real venue photography needs a paid Places-photo API. This is
   also what unblocks Design's deferred `next.config.ts` `images.remotePatterns`
   decision — once a host is chosen, that gets a `security` subagent look at
   the specific host, per the standing rule against a wildcard allowlist.

AI/LLM-based clue extraction and matching (steps 3–5) are **blocked on B3**
(OpenAI credits still zero) for anything requiring a model call — but intake,
schema persistence, catalog-only matching, and the two items above don't need
one and can start now.

**Assigned:** Security/Backend leads (data pipeline + the SSRF/fetch-safety
rules are squarely their turf); Frontend picks up the enriched-result UI once
a real API contract exists, not before.

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

## New frontend backlog (from the guest-vote verification)

| # | Task | Why | Size |
|---|---|---|---|
| **FE.10** | `/login` takes no `next` / redirect param. A guest who hits "Sign in" from the guest-paused vote screen authenticates and lands on `/home`, not back on the plan they were voting on. | Rough edge on the exact flow B1 just unblocked | S |

---

## Wave 0 — reconcile the map ✅ done 2026-08-28

Every lane navigates by these docs; they described a schema that no longer
existed.

- [x] **F0.1** Stale RLS claims fixed in `.claude/agents/README.md`,
      `security.md`, `backend-data.md`, `CLAUDE.md`. There is no `using (true)`
      policy left on the core tables — 020 replaced them with `plan_access`
      scoping. `security.md`'s frontmatter was routing on the old posture too.
- [x] **F0.2** `NEXT_AGENT.md` rule 6 — 020 applied, 021 pending.
- [x] **F0.4** After Dark committed (`67d76a3`).
- [x] **F0.5** Motion section reversed for bounded ambient night motion, with a
      note matching the Colour section's voice so it is not restored by accident.
- [x] **F0.3** Graphify refreshed to HEAD — 860 nodes, 1367 edges, 76 communities.
- [x] **F0.6** Orchestrator `tools:` corrected — it owned `PRIORITIES.md` but had
      no `Write`/`Edit`, so it could not update its own queue. Scoped by prose to
      the queue and handoff docs only.

---

## Wave 1 — dispatched 2026-08-28, in flight

All three lanes were dispatched in one message so they run concurrently; the
verifier was dispatched alongside them as a *producer* on QA.1/QA.2, because
`tests/**` and `package.json` are untouched by every lane this wave. The Wave 1
**gate** is a separate later run.

| Lane | Tasks | Files it may write |
|---|---|---|
| Frontend | FE.1, FE.2, FE.8 | `app/**`, `components/**`, `globals.css` |
| Backend | BE.1, BE.2 | `supabase/**`, `app/api/**`, `lib/types.ts`, `lib/supabase.ts` |
| Security | SEC.1–SEC.4 | *nothing* |
| Verifier | QA.1, QA.2 | `tests/**`, `package.json` |

Deferred to a later wave, deliberately: FE.3 (Dubai-clock theme), FE.4 (night
coverage), FE.5 (After Dark on the payoff), FE.6 (dead CSS), FE.7 (vote-page
states), FE.9 (component reuse). FE.3 and FE.4 are one cohesive piece of work and
all of them touch `globals.css`, which one lane can only hold once per wave.

## Wave 1 — FRONTEND (priority lane)

The audit found one story, and it is not "unfinished work": the app was
**deliberately walked back from playful to sleek**, and "boring" is that decision
showing. Three independent pieces of evidence — the palette comment at
`globals.css:1` (*"these used to be a lilac ground with plum ink and loud
purple/pink/yellow/green accents"*), the orphaned signature element, and ~450
lines of dead "fun" CSS. **Most of this lane is recovery, not invention.**

**⏸ Paused 2026-09-02 — FE.3, FE.5, FE.6 (all aesthetic decisions) on hold until
the owner's Claude Design handoff.** `globals.css` is frozen in the meantime.
FE.4 is split: its functional bug (night classes apply, tokens don't reliably
flip — verify, don't redesign) goes to the Review lane now; its "add night
coverage to new routes" half waits with the others.

| # | Task | Why | Size |
|---|---|---|---|
| **FE.1** | **Ship a real front door.** `app/page.tsx:6` sends signed-out visitors to `/login` in production; `app/home-preview/page.tsx:5` calls `notFound()` there. The marketing hero — best copy and layout in the repo — is **dev-only**. Every prospect meets an auth form. | Highest impact-to-effort in the audit | S |
| **FE.2** | **Restore the signature element, resolve the restraint block.** `globals.css:113` defines `.token` under its own heading *"the thread that makes the whole app feel tappable"*. It is orphaned (dropped from `OptionCard` in `8c3581c`, with the winner `rosette` stamp) **and** killed again at `:2941`, which also cancels hover `transform` on every `a`/`button` on every pointer device. | This is the mechanism behind "flat" | M |
| **FE.3** | **Theme follows the Dubai clock.** Recover the phase engine from `3dd972b` into `lib/dubai-phase.ts`; map phase → theme; `auto \| day \| night` override on `deal-three:theme`, default `auto`. | Ships the chosen direction to share-link voters, who cannot reach it at all today | L |
| **FE.4** | **Night coverage.** Only `.home-experience--night` / `.vote-experience--night` exist. `/login` + `/onboarding` use a separate `--auth-*` set with **no night variant**; `/privacy` + `/terms` have none. Cheapest correct fix: `--auth-*` falls back to `--color-*`. | Once FE.3 lands, an after-sunset visitor hits white screens mid-flow | L |
| **FE.5** | **Extend After Dark to the payoff.** `DecidedPlan.tsx` renders inside `.vote-experience--night` so it inherits the flipped variables but none of the lattice, halo or brass structure. | The winner reveal is the most emotionally important moment in the product | M |
| **FE.6** | **Decide on ~450 lines of dead "fun" CSS (~14% of the file).** A complete time-keeping skyline (`:188-444`, 7 `[data-phase]` palettes) and a decision-orbit wheel with floating ramen/karaoke/beach cards, scribbles, ticker (`:1037-1195`, `:1899-1938`). **FE.3 revives the `[data-phase]` half for free.** | Revive the cheap charm or delete — do not leave it dead a third time | M–L |
| **FE.7** | The vote page's `loading` / `error` / `captcha` / `notfound` states are unstyled scaffolding beside the most polished screen in the app, and are a real first-touch surface for a guest on an expired link. Four hand-rolled variants → one shared state component. | | M |
| **FE.8** | `.home-avatar` is 40×40px (`:631`), below the 44px the same file enforces at `:2850`. On screen on all five tabs. | | S |
| **FE.9** | **Component reuse.** No frontend component appears in the graph's top-10 god nodes. Empty states hand-rolled 5× across `AccountViews`/`DemoAccountViews`; three different "loading" idioms. Extract only what already repeats 3+ times. | | M |

## Wave 1 — BACKEND (parallel)

| # | Task | Why | Size |
|---|---|---|---|
| **BE.1** | **Revive the share-link vote path.** Blocked on **B1** for end-to-end proof, but not for the work: make the path correct for the moment the toggle flips, and until then **fail honestly** — a guest currently meets a dead screen with no explanation. | Critical; the product's own delivery item #1 | L |
| **BE.2** | Migration 022 — `spot-deal` quota scope, and the pgvector groundwork for RAG. | `/api/spots/deal` has no quota today | M |
| **BE.3** | **Guard rail, not a task:** never add a direct write policy on `votes`/`rsvps`/`ratings`. Recorded because it is the easiest hole in the repo to reopen. | | — |

## Wave 1 — SECURITY (parallel, read-only, never blocked)

| # | Task |
|---|---|
| **SEC.1** | Re-probe and report migration 021. Probe positively — `42501` proves nothing about your input. |
| **SEC.2** | `execute_plan_command` still `anon`-executable. Fails safe by raising, so defence-in-depth, not a break. |
| **SEC.3** | `/api/smart-search` skips auth when `NODE_ENV !== "production"` and consumes quota only when a user is present. Confirm preview deploys don't inherit it; prefer an explicit flag. |
| **SEC.4** | Full re-audit against the **current** schema. Check every function for the `revoke from public` mistake, not just the two known ones. |

## Wave 2 — verifier gate (`qa-test`)

| # | Task | Why |
|---|---|---|
| **QA.1** | **The tally and tie-break have zero automated coverage.** The `order by yes_count desc, spot_id` logic in `execute_plan_command` decides who wins a plan and is tested by nothing. All 25 tests are pure-function unit tests; `scripts/smoke-test.mjs` needs live infrastructure, so it is deployment verification, not regression coverage. | Highest-value test gap in the repo |
| **QA.2** | `test:security` and `test:wrapped` are plain aliases for `npm run test` and filter nothing — the names promise coverage they do not give. | A green `test:security` is currently misleading |
