-- Migration 079: Wikimedia Commons photos for curated spots, self-hosted.
--
-- STAGED -- written, not applied anywhere. Apply only with the owner's
-- approval, then record it in worklog.md the same day.
--
-- 17 openly licensed photos (CC0 / public domain / CC BY / CC BY-SA),
-- each hand-checked to show this venue or its exact site. Provenance per
-- photo (Commons file page, licence, author) is in data/venue-photos.json.
--
-- THE FILES SHIP WITH THE APP, NOT THE BUCKET: photo_url is a same-origin
-- path to public/venues/<spot id>.webp. Apply only after a production
-- deploy that contains those files, and check each URL returns an image
-- first (scripts/check-spot-photo-urls.sh only knows bucket URLs), e.g.
--   curl -sI https://plan-ind.vercel.app/venues/<spot id>.webp
-- Running this before the deploy points every card at a 404.
--
-- ATTRIBUTION IS A LICENCE CONDITION: photo_attribution must render wherever
-- the photo does (PhotoCredit). Re-run safe: each row only fills a null.
-- To drop one photo, null its three columns and delete its file.

begin;

-- The Dubai Mall -- CC BY-SA 4.0
update public.spots set photo_url = '/venues/89000000-0000-0000-0000-000000000001.webp', photo_source = 'wikimedia', photo_attribution = 'CoolP1x4rt / Wikimedia Commons / CC BY-SA 4.0'
  where id = '89000000-0000-0000-0000-000000000001' and source = 'curated' and photo_url is null;

-- La Mer -- CC BY-SA 4.0
update public.spots set photo_url = '/venues/40000000-0000-0000-0000-000000000002.webp', photo_source = 'wikimedia', photo_attribution = 'Safasaleem / Wikimedia Commons / CC BY-SA 4.0'
  where id = '40000000-0000-0000-0000-000000000002' and source = 'curated' and photo_url is null;

-- Kite Beach -- CC BY-SA 4.0
update public.spots set photo_url = '/venues/40000000-0000-0000-0000-000000000001.webp', photo_source = 'wikimedia', photo_attribution = 'MaryJaneB / Wikimedia Commons / CC BY-SA 4.0'
  where id = '40000000-0000-0000-0000-000000000001' and source = 'curated' and photo_url is null;

-- Dubai Marina Walk -- CC BY 3.0
update public.spots set photo_url = '/venues/50000000-0000-0000-0000-000000000003.webp', photo_source = 'wikimedia', photo_attribution = 'Francisco Anzola / Wikimedia Commons / CC BY 3.0'
  where id = '50000000-0000-0000-0000-000000000003' and source = 'curated' and photo_url is null;

-- Al Qudra Lakes -- CC BY-SA 4.0
update public.spots set photo_url = '/venues/50000000-0000-0000-0000-000000000001.webp', photo_source = 'wikimedia', photo_attribution = 'JSPhotography2016 / Wikimedia Commons / CC BY-SA 4.0'
  where id = '50000000-0000-0000-0000-000000000001' and source = 'curated' and photo_url is null;

-- Aquaventure World -- CC BY 2.0
update public.spots set photo_url = '/venues/84000000-0000-0000-0000-000000000001.webp', photo_source = 'wikimedia', photo_attribution = 'Fabio Achilli from Milano, Italy / Wikimedia Commons / CC BY 2.0'
  where id = '84000000-0000-0000-0000-000000000001' and source = 'curated' and photo_url is null;

-- Wild Wadi Waterpark -- CC BY 2.0
update public.spots set photo_url = '/venues/84000000-0000-0000-0000-000000000002.webp', photo_source = 'wikimedia', photo_attribution = 'Studio Sarah Lou / Wikimedia Commons / CC BY 2.0'
  where id = '84000000-0000-0000-0000-000000000002' and source = 'curated' and photo_url is null;

-- Al Shindagha Museum -- CC BY-SA 4.0
update public.spots set photo_url = '/venues/87000000-0000-0000-0000-000000000002.webp', photo_source = 'wikimedia', photo_attribution = 'Vaishnavi.vinodkumar / Wikimedia Commons / CC BY-SA 4.0'
  where id = '87000000-0000-0000-0000-000000000002' and source = 'curated' and photo_url is null;

-- Dubai Safari Park -- CC BY-SA 4.0
update public.spots set photo_url = '/venues/8a000000-0000-0000-0000-000000000002.webp', photo_source = 'wikimedia', photo_attribution = 'JairamPJ / Wikimedia Commons / CC BY-SA 4.0'
  where id = '8a000000-0000-0000-0000-000000000002' and source = 'curated' and photo_url is null;

-- Talise Spa Madinat Jumeirah -- CC BY-SA 4.0
update public.spots set photo_url = '/venues/88000000-0000-0000-0000-000000000001.webp', photo_source = 'wikimedia', photo_attribution = 'Diego Delso / Wikimedia Commons / CC BY-SA 4.0'
  where id = '88000000-0000-0000-0000-000000000001' and source = 'curated' and photo_url is null;

-- Shimmers -- CC BY-SA 4.0
update public.spots set photo_url = '/venues/d0000000-0000-0000-0000-000000000003.webp', photo_source = 'wikimedia', photo_attribution = 'Diego Delso / Wikimedia Commons / CC BY-SA 4.0'
  where id = 'd0000000-0000-0000-0000-000000000003' and source = 'curated' and photo_url is null;

-- Dubai Design District -- CC BY-SA 4.0
update public.spots set photo_url = '/venues/89000000-0000-0000-0000-000000000003.webp', photo_source = 'wikimedia', photo_attribution = 'Leakingh / Wikimedia Commons / CC BY-SA 4.0'
  where id = '89000000-0000-0000-0000-000000000003' and source = 'curated' and photo_url is null;

-- Soho Garden Meydan -- CC BY 2.0
update public.spots set photo_url = '/venues/81000000-0000-0000-0000-000000000001.webp', photo_source = 'wikimedia', photo_attribution = 'Sakena / Wikimedia Commons / CC BY 2.0'
  where id = '81000000-0000-0000-0000-000000000001' and source = 'curated' and photo_url is null;

-- Ninive -- CC BY 3.0
update public.spots set photo_url = '/venues/10000000-0000-0000-0000-000000000003.webp', photo_source = 'wikimedia', photo_attribution = 'Jackardsiffant / Wikimedia Commons / CC BY 3.0'
  where id = '10000000-0000-0000-0000-000000000003' and source = 'curated' and photo_url is null;

-- DRIFT Beach Dubai -- CC BY 3.0
update public.spots set photo_url = '/venues/83000000-0000-0000-0000-000000000001.webp', photo_source = 'wikimedia', photo_attribution = 'Aidas U. / Wikimedia Commons / CC BY 3.0'
  where id = '83000000-0000-0000-0000-000000000001' and source = 'curated' and photo_url is null;

-- Bu Qtair -- CC BY 2.0
update public.spots set photo_url = '/venues/a0000000-0000-0000-0000-000000000004.webp', photo_source = 'wikimedia', photo_attribution = 'Ankur P from Pune, India / Wikimedia Commons / CC BY 2.0'
  where id = 'a0000000-0000-0000-0000-000000000004' and source = 'curated' and photo_url is null;

-- The Nine -- CC BY-SA 4.0
update public.spots set photo_url = '/venues/30000000-0000-0000-0000-000000000004.webp', photo_source = 'wikimedia', photo_attribution = 'Chris Olszewski / Wikimedia Commons / CC BY-SA 4.0'
  where id = '30000000-0000-0000-0000-000000000004' and source = 'curated' and photo_url is null;

commit;
