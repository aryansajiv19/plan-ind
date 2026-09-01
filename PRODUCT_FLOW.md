# The intended flow

Recorded 2026-09-02 from the owner's brief, cross-checked against what's
actually built. This is the reference for Design's work and for Review/Security
to verify against — not a spec to re-derive from code, and not a wishlist to
build blind. Where a step isn't built yet, that's stated plainly, not implied.

## 1. Sign up / log in
`/login` — email OTP or Google OAuth. **Built and working.** Guests (share-link
voters) get an anonymous session instead — that's a separate path, see step 5.

## 2. Home — discover, start a plan, moodboards, collections
`/home`, five tabs: **Plan** (start/manage a plan), **Discover** (browse,
moodboards, "turn this board into a plan"), **Been** (past visits →
collections, photos), **Friends**, **Profile**. **Built**, matches the brief.
Moodboards and visit-photo collections exist as tables (migration 010) but per
the last audit have thin UI coverage — worth Review checking how complete the
Discover→moodboard and Been→collection loops actually are end to end, not just
that the screens render.

## 3. Host a plan — category + vibe
`StartPlanForm` — pick a category (dinner, cafe, brunch, etc.), vibe keywords,
budget, travel radius, origin area. **Built.**

## 4. Three rounds of three, then a final round
This is exactly the pool architecture already built, described from the
outside:

- The app deals **nine places across three pools of three** (`dealSpotIds` /
  `POST /api/spots/deal`).
- The group votes each pool down to **one finalist per pool** — that's
  "round 1 of three, round 2 of three, round 3 of three."
- The **three pool winners become the final round** — "the best three... dealt
  once more."
- A final vote among those three picks **the winner** — `execute_plan_command`
  tallies it, `cast_plan_vote` (migration 023) makes each vote idempotent and
  race-safe.

**Built and matches the brief exactly.** Nothing to change here — this was
worth confirming explicitly since it's the core mechanic.

## 5. Everyone votes
Share-link guests get an anonymous session, redeem the link into
`plan_access`, vote with `cast_plan_vote`. **Built and verified end-to-end**
(2026-09-01, after B1/anon-sign-ins went live).

## 6. The payoff — photos, travel time, weather, vibe, budget, transport/carpooling
**Partially built.** `DecidedPlan.tsx` today shows: the winning spot's photo,
description, price band, and a `booking_owner`/`booked`/`booking_url` flow
(who's booking it, a link to book). `plans` also carries `event_time` and
origin lat/long; `spots` carries its own lat/long.

**Not built — genuine gaps, not bugs:**
- **Weather** — no column, no display. The Open-Meteo integration was already
  scoped as a *tool* for the future AI agent loop (see `NEXT_AGENT.md` — "the
  weather tool," verified working, no API key needed), not yet wired into the
  payoff screen. Could be added independently of the AI work — it's a plain
  fetch, not model-dependent.
- **Travel time** — origin/spot lat-longs exist, nothing computes or shows a
  duration between them.
- **Transportation / carpooling coordination** — no schema, no UI, no concept
  anywhere in the codebase today. This is new product surface, not a fix.

This is real design + build work, not a Review task. Once Design has a
direction for this screen, it's a Backend-scoped addition (new plan/RSVP
fields at minimum for transport coordination) plus a Frontend build.

## 7. After the plan — send photos to collections
Maps to the **Been** tab / `visit_photos` / `visit_collections` (migration
010). Tables exist; per the last audit **"nothing uses them"** — this was
flagged as unfinished before this session started and hasn't been picked up
since. Real gap, same category as step 6: build work once Design specs it.

---

## Summary for the team

- **Steps 1, 2, 3, 4, 5 are built and match the intended flow.** Step 4
  specifically was worth double-checking since it's the core mechanic — it's
  right.
- **Steps 6 and 7 are partially built.** The winner-reveal screen exists but
  is missing weather/travel-time/transport; the post-visit photo/collection
  loop has tables but thin-to-no UI. Both are Design's territory once specced,
  then Backend + Frontend build them — not something Security or Review
  should build blind.
- **Review's actionable takeaway:** verify steps 1–5 hold up end-to-end for
  real (not just "the code looks right") — particularly the Discover→moodboard
  and Been→collection loops in step 2, since "thin UI coverage" often hides
  actual bugs, not just missing features. Flag anything broken; don't build
  new payoff/collection features without a design spec.
