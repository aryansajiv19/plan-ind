-- Migration 037: backfill latitude/longitude on the curated catalog.
--
-- All 82 curated spots shipped with null coordinates, which means the
-- "getting there" feature (haversine distance + Maps link) could never
-- render for a real user. This is a one-time data fix, not a feature:
-- coordinates were geocoded once via Nominatim (OpenStreetMap's free
-- geocoder -- no paid Places API) by scripts/backfill-spot-coordinates.mjs,
-- then reviewed by hand before landing here.
--
-- Only 40 of the 82 are in this migration. The other 42 are
-- deliberately left null: 29 had no Nominatim match at all, and 13 matched
-- a *different* venue that merely shares part of the name (a wrong branch
-- of a chain, a parking garage, an unrelated business). A wrong coordinate
-- is worse than a null one -- null just hides the distance line, wrong
-- sends someone to the wrong side of the city -- so the doubtful ones stay
-- null until they are looked up by hand.
--
-- Guarded with "latitude is null" so re-running can never overwrite a
-- coordinate that has since been corrected by hand.

-- Aventura Parks (Mushrif Park)
update public.spots set latitude = 25.2231194, longitude = 55.4481273
  where id = '86000000-0000-0000-0000-000000000002' and latitude is null;

-- Deep Dive Dubai (Nad Al Sheba)
update public.spots set latitude = 25.1277269, longitude = 55.2949039
  where id = '86000000-0000-0000-0000-000000000001' and latitude is null;

-- Kite Beach (Umm Suqeim)
update public.spots set latitude = 25.1630042, longitude = 55.2067193
  where id = '40000000-0000-0000-0000-000000000001' and latitude is null;

-- La Mer (Jumeirah)
update public.spots set latitude = 25.2270926, longitude = 55.256325
  where id = '40000000-0000-0000-0000-000000000002' and latitude is null;

-- Nikki Beach (Pearl Jumeirah)
update public.spots set latitude = 25.2474766, longitude = 55.2556055
  where id = '40000000-0000-0000-0000-000000000004' and latitude is null;

-- Reform Social & Grill (The Lakes)
update public.spots set latitude = 25.0788963, longitude = 55.1676834
  where id = '10000000-0000-0000-0000-000000000001' and latitude is null;

-- %Arabica JBR (JBR)
update public.spots set latitude = 25.0787775, longitude = 55.1339221
  where id = 'c0000000-0000-0000-0000-000000000002' and latitude is null;

-- One Life Kitchen (Design District)
update public.spots set latitude = 25.1882164, longitude = 55.2980663
  where id = 'c0000000-0000-0000-0000-000000000004' and latitude is null;

-- Tom & Serg (Al Quoz)
update public.spots set latitude = 25.1459715, longitude = 55.2232999
  where id = 'c0000000-0000-0000-0000-000000000001' and latitude is null;

-- Al Shindagha Museum (Dubai Creek)
update public.spots set latitude = 25.2664738, longitude = 55.2889645
  where id = '87000000-0000-0000-0000-000000000002' and latitude is null;

-- Jameel Arts Centre (Jaddaf Waterfront)
update public.spots set latitude = 25.2289912, longitude = 55.3405048
  where id = '87000000-0000-0000-0000-000000000001' and latitude is null;

-- Museum of the Future (Trade Centre)
update public.spots set latitude = 25.2191545, longitude = 55.2818746
  where id = '87000000-0000-0000-0000-000000000003' and latitude is null;

-- Black Tap (Jumeirah)
update public.spots set latitude = 25.0802779, longitude = 55.1360939
  where id = '20000000-0000-0000-0000-000000000003' and latitude is null;

-- Bu Qtair (Umm Suqeim)
update public.spots set latitude = 25.1515093, longitude = 55.1971669
  where id = 'a0000000-0000-0000-0000-000000000004' and latitude is null;

-- Ravi Restaurant (Al Satwa)
update public.spots set latitude = 25.2336615, longitude = 55.2790297
  where id = 'a0000000-0000-0000-0000-000000000002' and latitude is null;

-- Dubai Safari Park (Al Warqa)
update public.spots set latitude = 25.1793246, longitude = 55.4515731
  where id = '8a000000-0000-0000-0000-000000000002' and latitude is null;

-- KidZania Dubai (Downtown Dubai)
update public.spots set latitude = 25.1950306, longitude = 55.279989
  where id = '8a000000-0000-0000-0000-000000000003' and latitude is null;

-- Dubai Bowling Centre (Al Quoz)
update public.spots set latitude = 25.1751126, longitude = 55.2559282
  where id = 'f0000000-0000-0000-0000-000000000003' and latitude is null;

-- The Smash Room (Al Quoz)
update public.spots set latitude = 25.1101216, longitude = 55.2224471
  where id = 'f0000000-0000-0000-0000-000000000004' and latitude is null;

-- Bla Bla (JBR)
update public.spots set latitude = 25.0745906, longitude = 55.129171
  where id = '70000000-0000-0000-0000-000000000002' and latitude is null;

-- Hard Rock Cafe Dubai (Dubai Festival City)
update public.spots set latitude = 25.2239285, longitude = 55.351529
  where id = '82000000-0000-0000-0000-000000000003' and latitude is null;

-- The Fridge (Alserkal Avenue)
update public.spots set latitude = 25.1420625, longitude = 55.2266869
  where id = '82000000-0000-0000-0000-000000000001' and latitude is null;

-- Cinema Akil (Al Serkal Avenue)
update public.spots set latitude = 25.1422119, longitude = 55.2241957
  where id = 'e0000000-0000-0000-0000-000000000001' and latitude is null;

-- Reel Cinemas (Dubai Mall)
update public.spots set latitude = 25.1969706, longitude = 55.281304
  where id = 'e0000000-0000-0000-0000-000000000003' and latitude is null;

-- Roxy Cinemas (City Walk)
update public.spots set latitude = 25.2072147, longitude = 55.2629762
  where id = 'e0000000-0000-0000-0000-000000000002' and latitude is null;

-- Soho Garden Meydan (Meydan)
update public.spots set latitude = 25.1581391, longitude = 55.3001114
  where id = '81000000-0000-0000-0000-000000000001' and latitude is null;

-- Al Qudra Lakes (Seih Al Salam)
update public.spots set latitude = 24.8347634, longitude = 55.3759762
  where id = '50000000-0000-0000-0000-000000000001' and latitude is null;

-- Dubai Marina Walk (Dubai Marina)
update public.spots set latitude = 25.0855573, longitude = 55.1476077
  where id = '50000000-0000-0000-0000-000000000003' and latitude is null;

-- Hatta Wadi Hub (Hatta)
update public.spots set latitude = 24.8139804, longitude = 56.1598617
  where id = '50000000-0000-0000-0000-000000000002' and latitude is null;

-- The Green Planet (City Walk)
update public.spots set latitude = 25.2060627, longitude = 55.2603991
  where id = '50000000-0000-0000-0000-000000000004' and latitude is null;

-- Shimmers (Jumeirah Beach)
update public.spots set latitude = 25.1350737, longitude = 55.1842402
  where id = 'd0000000-0000-0000-0000-000000000003' and latitude is null;

-- Dubai Design District (Dubai Design District)
update public.spots set latitude = 25.1913379, longitude = 55.2985124
  where id = '89000000-0000-0000-0000-000000000003' and latitude is null;

-- Mall of the Emirates (Al Barsha)
update public.spots set latitude = 25.1179818, longitude = 55.2003754
  where id = '89000000-0000-0000-0000-000000000002' and latitude is null;

-- The Dubai Mall (Downtown Dubai)
update public.spots set latitude = 25.197044, longitude = 55.2789516
  where id = '89000000-0000-0000-0000-000000000001' and latitude is null;

-- InSportz Club (Al Quoz)
update public.spots set latitude = 25.1284097, longitude = 55.2131729
  where id = '60000000-0000-0000-0000-000000000004' and latitude is null;

-- The Huddle Sports Bar (Al Barsha)
update public.spots set latitude = 25.1153863, longitude = 55.2037334
  where id = '60000000-0000-0000-0000-000000000001' and latitude is null;

-- CÉ LA VI (Address Sky View)
update public.spots set latitude = 25.2020318, longitude = 55.2708363
  where id = '30000000-0000-0000-0000-000000000001' and latitude is null;

-- Koko Bay (Palm Jumeirah)
update public.spots set latitude = 25.1068724, longitude = 55.1432548
  where id = '30000000-0000-0000-0000-000000000003' and latitude is null;

-- Terra Solis (Dubai Desert)
update public.spots set latitude = 24.9911027, longitude = 55.4186758
  where id = '30000000-0000-0000-0000-000000000002' and latitude is null;

-- Wild Wadi Waterpark (Jumeirah)
update public.spots set latitude = 25.1396485, longitude = 55.189428
  where id = '84000000-0000-0000-0000-000000000002' and latitude is null;
