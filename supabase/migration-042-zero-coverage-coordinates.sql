-- Migration 042: coordinates for 4 of the 12 zero-coverage spots.
--
-- beach_club, escape, padel and wellness were the only four categories at 0%
-- coordinates AND 0% photos — the app's weakest surfaces, and the same four
-- Google Places has no clean type for, so they do not get fixed by the
-- ingestion decision either. Twelve spots, small enough to hand-review the
-- way 037 was.
--
-- ── Four, not twelve, and why ────────────────────────────────────────────
--
-- These venues are mostly absent from OpenStreetMap entirely. Where the
-- venue itself is missing, the query targeted the LANDMARK THAT CONTAINS IT
-- (a beach club is at a named resort; a spa is inside a named complex), and
-- each result was checked by hand to confirm it is that landmark.
--
-- So these four coordinates are landmark-level, not door-level: they place
-- you at the resort or complex the venue sits in, within a few hundred
-- metres. That is materially correct for what the data is used for — a
-- straight-line distance and a Maps link, where "the resort" is where you
-- would actually be dropped off — but it is not a survey point, and the
-- comment on each row says which landmark it came from so nobody later
-- mistakes it for one.
--
-- ── The eight left null, deliberately ────────────────────────────────────
--
-- O Beach Dubai, Anantara World Islands, Bab Al Shams, Hatta Dome Park,
-- Padel Art, World Padel Academy, SEVEN Wellness Club, The Hundred Wellness
-- Centre.
--
-- Six returned nothing at all. Two returned something worse than nothing:
--
--   * "Bab Al Shams" matched a LAUNDRY IN SHARJAH — a different emirate,
--     ~60km from the desert resort. The textbook false positive, and exactly
--     why the loose-query fallback was abandoned in 037.
--   * Anantara World Islands: the only coordinate available is Wikipedia's
--     centroid for The World archipelago. The resort is on one specific
--     island; the centroid is kilometres of open water away. A coordinate
--     that looks plausible and is kilometres wrong is worse than a null one,
--     because null merely hides a line while wrong sends someone to sea.
--
-- These eight want a hand-pasted coordinate from someone who knows the
-- venues, not a cleverer geocoder. Free geocoding has been pushed as far as
-- it honestly goes here.
--
-- Guarded on `latitude is null` and keyed by id, so each is individually
-- revertible and a re-run cannot clobber a hand correction.

-- DRIFT Beach Dubai — via One&Only Royal Mirage, Al Sufouh (the resort DRIFT
-- belongs to; OSM has the resort, not the beach club).
update public.spots set latitude = 25.095009, longitude = 55.150372
  where id = '83000000-0000-0000-0000-000000000001' and latitude is null;

-- Twiggy by La Cantine — via Park Hyatt Dubai / Dubai Creek Resort, the
-- waterfront complex it sits in.
update public.spots set latitude = 25.244137, longitude = 55.332819
  where id = '83000000-0000-0000-0000-000000000002' and latitude is null;

-- Padel Pro One Central — via the One Central development at Dubai World
-- Trade Centre (matched through 25hours Hotel Dubai One Central, which is in
-- the same complex).
update public.spots set latitude = 25.219484, longitude = 55.283981
  where id = '85000000-0000-0000-0000-000000000001' and latitude is null;

-- Talise Spa — via Madinat Jumeirah, Umm Suqeim. The spa is inside the
-- resort the name already states.
update public.spots set latitude = 25.133375, longitude = 55.187379
  where id = '88000000-0000-0000-0000-000000000001' and latitude is null;
