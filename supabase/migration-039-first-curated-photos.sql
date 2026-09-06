-- Migration 039: the first reviewed curated photos.
--
-- Six of 82. Sourced free (worklog 2026-09-06): the venue's own site where
-- one exists, otherwise a freely-licensed Wikimedia image of a landmark.
-- Requires migration 038 (columns + the public spot-photos bucket).
--
-- ⚠ THE IMAGE FILES MUST BE IN THE LIVE BUCKET BEFORE THIS RUNS. This
-- project has no service-role key by design, so the backfill script can only
-- write to a local bucket -- it cannot push to live, and nothing in the app
-- can either (038 grants no client write path to this bucket). Upload the
-- six files in scripts/spot-photos/ to the 'spot-photos' bucket via the
-- Supabase dashboard, keeping the filenames EXACTLY as they are -- each is
-- named for its spot id, which is what the URLs below resolve to. Running
-- this migration first would point every card at a 404.
--
-- ⚠ ATTRIBUTION IS A LICENCE CONDITION, NOT A NICETY. Five of these six are
-- CC-licensed and must display photo_attribution wherever the photo renders
-- (PhotoTile, the place/option cards, DecidedPlan, WinnerPhotoReveal). Until
-- that is built, these images are technically in breach on display. The
-- constraint in 038 guarantees the credit is STORED; only the UI can
-- guarantee it is SHOWN.
--
-- Hand-reviewed by opening every image. Three fetched cleanly, carried valid
-- free licences, and were still rejected: Black Tap's photo is the New York
-- branch, VOX Cinemas' is the wrong branch on a grey day, and Dubai Safari
-- Park's "image" was an SVG logo. Licence-clean is not the bar.
--
-- Individually reversible: to drop one bad photo, null its three columns and
-- delete that one object. No re-run, no cascade.

-- Museum of the Future (culture) -- CC-BY-SA-4.0
update public.spots set
  photo_url = 'https://zyojaoyatunjwgbivaqu.supabase.co/storage/v1/object/public/spot-photos/87000000-0000-0000-0000-000000000003.jpg',
  photo_source = 'wikimedia',
  photo_attribution = 'Lyonerov / Wikimedia Commons / CC-BY-SA-4.0'
  where id = '87000000-0000-0000-0000-000000000003' and photo_url is null;

-- Mall of the Emirates (shopping) -- CC BY 2.0
update public.spots set
  photo_url = 'https://zyojaoyatunjwgbivaqu.supabase.co/storage/v1/object/public/spot-photos/89000000-0000-0000-0000-000000000002.jpg',
  photo_source = 'wikimedia',
  photo_attribution = 'Peter Gronemann from Switzerland / Wikimedia Commons / CC BY 2.0'
  where id = '89000000-0000-0000-0000-000000000002' and photo_url is null;

-- The Green Planet (outdoors) -- CC BY-SA 4.0
update public.spots set
  photo_url = 'https://zyojaoyatunjwgbivaqu.supabase.co/storage/v1/object/public/spot-photos/50000000-0000-0000-0000-000000000004.jpg',
  photo_source = 'wikimedia',
  photo_attribution = 'WikiSilky / Wikimedia Commons / CC BY-SA 4.0'
  where id = '50000000-0000-0000-0000-000000000004' and photo_url is null;

-- Deep Dive Dubai (adventure) -- CC BY-SA 4.0
update public.spots set
  photo_url = 'https://zyojaoyatunjwgbivaqu.supabase.co/storage/v1/object/public/spot-photos/86000000-0000-0000-0000-000000000001.jpg',
  photo_source = 'wikimedia',
  photo_attribution = 'Deep dive dubai / Wikimedia Commons / CC BY-SA 4.0'
  where id = '86000000-0000-0000-0000-000000000001' and photo_url is null;

-- Cinema Akil (movie) -- CC BY 2.5
update public.spots set
  photo_url = 'https://zyojaoyatunjwgbivaqu.supabase.co/storage/v1/object/public/spot-photos/e0000000-0000-0000-0000-000000000001.jpg',
  photo_source = 'wikimedia',
  photo_attribution = 'Mohamed Somji / Wikimedia Commons / CC BY 2.5'
  where id = 'e0000000-0000-0000-0000-000000000001' and photo_url is null;

-- Tresind Studio (dinner) -- venue's own image
update public.spots set
  photo_url = 'https://zyojaoyatunjwgbivaqu.supabase.co/storage/v1/object/public/spot-photos/a0000000-0000-0000-0000-000000000005.jpg',
  photo_source = 'venue_site',
  photo_attribution = null
  where id = 'a0000000-0000-0000-0000-000000000005' and photo_url is null;
