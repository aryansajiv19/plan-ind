-- Migration 098: the venue's own photo for three catalogue venues the demo
-- shows: Reif Japanese Kushiyaki and 3Fils (/demo/vote's first round) and
-- Padel Art (the demo's Been and ranking).
--
-- STAGED -- not applied anywhere. Apply only with the owner's approval, after
-- the deploy that ships public/venues/<id>.webp, then record it in
-- worklog.md the same day.
--
-- Each is the venue's own website image, checked by hand to show the venue
-- itself (the same basis as 091 and 097). Until now each drew Google's photo
-- per view, which can fail on quota. Fills a null only. Re-run safe.

begin;

-- Reif Japanese Kushiyaki (from https://www.reifkushiyaki.com/dubai-hills)
update public.spots set photo_url = '/venues/a0000000-0000-0000-0000-000000000001.webp', photo_source = 'venue_site', photo_attribution = null
  where id = 'a0000000-0000-0000-0000-000000000001' and photo_url is null;
-- 3Fils (from https://www.3fils.com/)
update public.spots set photo_url = '/venues/a0000000-0000-0000-0000-000000000003.webp', photo_source = 'venue_site', photo_attribution = null
  where id = 'a0000000-0000-0000-0000-000000000003' and photo_url is null;
-- Padel Art (from https://www.padelart.ae/)
update public.spots set photo_url = '/venues/85000000-0000-0000-0000-000000000002.webp', photo_source = 'venue_site', photo_attribution = null
  where id = '85000000-0000-0000-0000-000000000002' and photo_url is null;

commit;
