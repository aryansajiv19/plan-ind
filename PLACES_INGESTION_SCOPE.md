# Places-backed ingestion — scope, cost, and an honest timeline

**Status: proposal. Nothing built, no API key exists, no billing account
exists, and nothing here has been run against Google.** This is the document
to read before spending money.

Written 2026-09-06 by the Security/Backend lane, in answer to: *"I'm aiming
for 500–1000s of venues, Dubai is a huge city, there are so many places —
how are we gonna make this work?"*

## Where things stood when this was written

So the numbers below are readable cold, without reconstructing the day:

- **82 curated spots.** 40 have coordinates (migration 037, live). **0 have
  photos** — migration 039 would make it 6, and is held pending the owner
  uploading six image files by hand.
- **Four categories — beach_club, escape, padel, wellness — are at 0%
  coordinates AND 0% photos.** They are also the four Google has no clean
  type for. That is the same weakness three times over, and §1 and §6 are
  about why Places does not fix it on its own.
- Free photo sourcing was measured, not estimated, and tops out at **~10 of
  82**: only 2 spots have any website URL (one domain dead), and Wikipedia
  yields ~9, all landmarks. That measurement is what makes Places worth
  costing at all.

## The short version

The bottleneck is **venue discovery**, not photos. The 12 missing
coordinates, the 76 missing photos and the 1000-venue ambition are one
problem, and Places solves all three in a single integration.

**On cost, the headline is better than expected: at 1000 venues this is free,
and at 5000 venues it is still free** — not the ~$80 previously estimated —
*provided* the field masks are built correctly. The cost lever is entirely in
how requests are shaped, and getting it wrong is roughly a 20x difference.

**On time: 5–8 working days** to a catalogue of ~1000 venues with photos.
Not a month. But it is 5–8 days that buy a *different product*, and that
tradeoff is the real decision — see [Is this a side quest?](#is-this-a-side-quest).

## 1. Ingestion design

### Discovery

**Text Search over a `category × area` grid.** Dubai divides cleanly into
~20 recognisable areas (Marina, JBR, Downtown, Business Bay, Al Quoz,
Jumeirah, Deira, DIFC, JLT, Al Barsha, Palm, Hatta…), and we have 23
categories. A full grid is ~460 queries, each returning up to 20 places
(60 with pagination).

**Coverage will not be uniform across our 23 categories, and that matters.**
Google's `includedType` taxonomy maps well to some of ours and badly to
others:

| our category | Google type | expected |
|---|---|---|
| dinner, brunch, cafe, dessert | `restaurant`, `cafe`, `bakery` | excellent |
| nightlife, live_music, karaoke | `bar`, `night_club` | good |
| movie, shopping, family, culture | `movie_theater`, `shopping_mall`, `museum` | good |
| beach, outdoors | `beach`, `park` | good |
| wellness | `spa`, `gym` | fair |
| **padel, escape, beach_club, shisha, games, adventure, vibes** | **no clean type** | **weak — text query only** |

The weak row is not a coincidence: **it is the same four-to-seven categories
that already have 0% coordinates and 0% photos.** Padel courts and escape
rooms are not restaurants, and Google has no type for them; they surface only
through free-text queries ("padel Dubai Marina"), which return noisier
results. Plan for hand-curation in those categories regardless of what
Places gives us — this is a compounding weak spot, not a gap Places closes on
its own.

### Enrichment and photos

Per T0's design, and it is the right one:

1. Places gives us each venue's **`websiteUri`**.
2. Our **existing extractor** (`lib/place-import/`) fetches the venue's own
   site and reads its `og:image`. This is already SSRF-hardened, byte-capped,
   timeout-bounded and licence-neutral — the machinery is built, hardened and
   as of today actually correct (the truncation and slow-loris fixes landed
   this morning). It failed at 1/82 only because 80 spots had no URL to aim
   it at. Places supplies exactly that missing input.
3. The resulting image comes from the **venue's own server**, so we can store
   it permanently in our own bucket with no Google caching restriction.
4. **Google's own photos are a fallback only.** They may not be cached or
   stored, so they cost per view forever, and they are billed at Enterprise.
   Use them only where a venue has no site, and treat that as a running cost.

### Lifecycle

```
discover (Text Search)  →  spots row keyed by place_id
      ↓
enrich (websiteUri in the same response)
      ↓
photo (our extractor → our bucket)   |   no site → Google photo, uncached
      ↓
re-check (id-only refresh, free)  →  NOT_FOUND ⇒ closed ⇒ hide
```

## 2. Real cost — verified against Google's own pricing, not assumed

I checked the SKU tables directly rather than taking the earlier estimate on
trust. **The earlier figures given to you were right on the facts** —
`websiteUri` is a Place Details **Enterprise** field (1,000 free/month, $20
per 1,000 after), Text Search is **Pro** (5,000 free/month, $32 per 1,000) —
**and the conclusion drawn from them was too pessimistic**, because it
assumed one Place Details call per venue.

**The optimisation: put `websiteUri` in the *Text Search* field mask.**
Billing is set by the highest tier in a request, so this makes the search an
Enterprise Text Search ($35/1,000, **1,000 free/month**) — but it returns
**20 venues per request** instead of one. That is a ~20x reduction.

| venues | one Details call each | websiteUri via Text Search | 
|---|---|---|
| 500 | free (under 1,000) | ~25 requests — **free** |
| 1,000 | free (exactly at the cap) | ~50 requests — **free** |
| 5,000 | 4,000 billable ≈ **$80** | ~250 requests — **free** |
| 20,000 | ≈ **$380** | ~1,000 requests — **free**, at the cap |

**One-time cost at any volume we plausibly want: $0.** The free Enterprise
allowance of 1,000 requests/month covers ~20,000 venues when each request
carries 20 of them. Even the pessimistic per-venue path is $80 at 5,000 — a
real number, but the batched path makes it moot.

**Ongoing cost: $0**, with one exception. Refreshing a stored `place_id` is
explicitly **free when only the id field is requested**, so the freshness
loop costs nothing (§4). The exception is venues with no website, where a
Google photo is fetched per view and cannot be cached — that is the only
line item that scales with *traffic* rather than catalogue size, and it is a
reason to prefer the website route hard.

**The trap to design around:** because billing follows the highest-tier field
in a request, one careless `rating` or `reviews` added to a field mask
silently reprices every call. The field mask must be a reviewed constant, not
something assembled ad hoc at a call site.

## 3. Keying on `place_id` — pressure-tested

**Recommended, with one caveat that needs a deliberate answer.**

The case for it is strong, and stronger than "it's a stable key". **It
designs out an entire bug class that has bitten this project twice today in
two unrelated systems.** `overlapScore`'s `min()` divisor and Wikipedia's
own search independently failed on the *same* venues — Hummingbird matched
the bird, SoBe a drink brand, Saffron the spice, Bla Bla an animated film.
17 of our 82 spots have a single-token name. At 82 venues that is
hand-reviewable; **at 1000 it is not**, and the failures are silent and
plausible rather than loud. An identifier removes the question entirely.

`place_id` is also, unusually, safe to store: Google explicitly exempts it
from the caching restrictions in their ToS, so a permanent local copy is
allowed rather than tolerated.

**The caveat, which is real:** venues users import by link (the place-import
feature) may not exist in Google. So `place_id` cannot be the primary key —
it must be a **nullable unique column** alongside our own uuid:

```sql
place_id text unique   -- null for user-imported and hand-added venues
```

Our uuid stays primary. That keeps user-imported venues first-class rather
than second-class, and avoids a migration that would break every existing
foreign key (`plan_spots`, `visits`, `ratings` all point at `spots.id`).
Deduplication between a user's imported venue and a later Places result then
becomes a real question — my recommendation is to *not* auto-merge them, and
to revisit only if duplicates actually show up in practice.

## 4. Freshness — the good news

**Re-checking is free.** Google recommends refreshing IDs older than 12
months and states that a refresh requesting *only* the id field incurs no
charge. A `NOT_FOUND` response means the venue is gone; `INVALID_REQUEST`
means the stored ID is corrupt.

So: a monthly job over the whole catalogue, id-field-only, marking
`NOT_FOUND` venues inactive. At 1000 venues that is ~1000 free requests. The
only design requirement is that a closed venue is **hidden from dealing but
not deleted** — a past plan that points at it must still render, or we break
history to fix freshness.

This matters more than it sounds: **a decided plan pointing at a closed
restaurant is worse than any bug discussed so far**, because the group finds
out at the door.

## 5. User photos as the compounding asset

**Agreed, and `visit_photos` already exists and already works** — verified
end-to-end this week (upload confined to the caller's own folder, cross-user
upload refused, signed URLs issued from the caller's own session, no server
credential anywhere in the path).

At 1000 venues, seeded photos will be uneven and will age. User photos are
the only thing that improves the catalogue over time rather than degrading
it. What it needs:

- **A promotion path.** Today a `visit_photo` belongs to a person, not a
  place. Something has to decide when a user's photo becomes *the* photo for
  a spot — the cheapest honest version is "most recent user photo wins for
  display, seeded photo as fallback", with no ranking or moderation queue.
- **A moderation answer before it ships publicly.** Right now photos are
  owner-scoped and private-ish. The moment one renders on a shared plan
  screen, an inappropriate upload becomes everyone's problem. This is the
  part I would *not* hand-wave; it needs a decision, not code.

## 6. Coverage realism

**60–75% is about right for the website route, and I can partly evidence it.**

The measurable part: of the two venues in our catalogue that *have* a website
URL, one resolved a clean `og:image` on the first attempt and one had a dead
domain. That is a sample of two — worthless as a rate, but it does confirm
both the success and failure modes are real.

The unmeasurable part is what fraction of Dubai venues (a) have a website in
Google at all and (b) put a usable `og:image` on it. Independent restaurants
increasingly use Instagram as their only web presence, and Instagram's oEmbed
needs credentials we do not have — that is precisely the `unsupported_provider`
path already in the code. My expectation is:

- **restaurants, cafés, brunch, dessert: 70–85%** — high website ownership
- **nightlife, beach clubs, karaoke: 50–65%** — Instagram-first
- **padel, escape rooms, wellness: 40–60%** — small operators
- **malls, cinemas, attractions: 85–95%** — corporate sites

Blended, **~65%**, with the shortfall concentrated in the same categories
that are already weakest. I would not promise the owner 100%, and I would not
fill the remainder with stock.

## Is this a side quest?

**5–8 working days**, honestly estimated:

| | |
|---|---|
| Places client + field-mask discipline + the `category × area` grid | 1–2 days |
| `place_id` column, dedup rules, schema/types pass, migration | 1 day |
| Wiring the existing extractor to ingestion + bucket writes at volume | 1–2 days |
| Freshness job + closed-venue handling | 1 day |
| Review tooling — **the real risk, see below** | 1–2 days |

**The estimate's biggest uncertainty is not the code, it is the review.** At
82 venues I hand-checked every photo by opening it, and rejected 3 of 9 that
had fetched cleanly and carried valid licences — Black Tap's photo was the
New York branch, VOX's was the wrong Dubai branch. That is a 33% rejection
rate *after* the automated checks passed. **That approach does not survive
1000 venues**, so ingestion needs either a fast review UI or an accepted
error rate. Pretending otherwise is how wrong photos ship.

**What it costs elsewhere:** it is 5–8 days not spent on the app that is
nearly finished. Against that, it is the only path that answers the actual
question — 82 venues is not a Dubai hangout app, it is a demo of one — and
the photo problem, the coordinate problem and the scale problem collapse into
one piece of work rather than three.

**My recommendation:** worth doing, *after* the current blockers close. It is
a genuine unlock rather than a detour, but it is not more urgent than
shipping what already works. The strongest argument for doing it soon is that
every day it waits, the hand-curated catalogue grows the very manual debt
this replaces.
