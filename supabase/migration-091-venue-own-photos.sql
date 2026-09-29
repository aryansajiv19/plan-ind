-- Migration 091: the venue's own photo for 17 curated spots.
--
-- Each image is the venue's own website image (og:image), checked by hand to
-- show the venue itself (logos, banners and screenshots were rejected), stored
-- in the app at public/venues/<id>.webp like the earlier own photos.
-- Only fills a spot that has no photo yet. Re-run safe.

begin;

-- Nikki Beach (from https://dubai.nikkibeach.com/)
update public.spots set photo_url = '/venues/40000000-0000-0000-0000-000000000004.webp', photo_source = 'venue_site', photo_attribution = null
  where id = '40000000-0000-0000-0000-000000000004' and photo_url is null;
-- Andreea's Beach Club (from http://www.andreeas.ae/)
update public.spots set photo_url = '/venues/c0890000-0000-0000-0001-000295b10665.webp', photo_source = 'venue_site', photo_attribution = null
  where id = 'c0890000-0000-0000-0001-000295b10665' and photo_url is null;
-- Brasserie 2.0 (from http://www.brasserie2point0.com/)
update public.spots set photo_url = '/venues/10000000-0000-0000-0000-000000000002.webp', photo_source = 'venue_site', photo_attribution = null
  where id = '10000000-0000-0000-0000-000000000002' and photo_url is null;
-- Jameel Arts Centre (from https://www.jameelartscentre.org/)
update public.spots set photo_url = '/venues/87000000-0000-0000-0000-000000000001.webp', photo_source = 'venue_site', photo_attribution = null
  where id = '87000000-0000-0000-0000-000000000001' and photo_url is null;
-- The Theater Dubai (from http://www.thetheaterdubai.com/)
update public.spots set photo_url = '/venues/c0890000-0000-0000-0001-00024a89e98c.webp', photo_source = 'venue_site', photo_attribution = null
  where id = 'c0890000-0000-0000-0001-00024a89e98c' and photo_url is null;
-- La Fragola (from https://lafragolagelateria.com/)
update public.spots set photo_url = '/venues/c0890000-0000-0000-0001-000345777670.webp', photo_source = 'venue_site', photo_attribution = null
  where id = 'c0890000-0000-0000-0001-000345777670' and photo_url is null;
-- The Maine Oyster Bar and Grill (from https://themainegroup.com/restaurants/the-maine-oyster-bar-grill/)
update public.spots set photo_url = '/venues/c0890000-0000-0000-0001-0000f466cf94.webp', photo_source = 'venue_site', photo_attribution = null
  where id = 'c0890000-0000-0000-0001-0000f466cf94' and photo_url is null;
-- Tresind Studio (from https://tresindstudio.com/)
update public.spots set photo_url = '/venues/a0000000-0000-0000-0000-000000000005.webp', photo_source = 'venue_site', photo_attribution = null
  where id = 'a0000000-0000-0000-0000-000000000005' and photo_url is null;
-- PlayDXB (from https://entertainment.emaar.com/attraction/play-dxb)
update public.spots set photo_url = '/venues/c0890000-0000-0000-0001-00016708b191.webp', photo_source = 'venue_site', photo_attribution = null
  where id = 'c0890000-0000-0000-0001-00016708b191' and photo_url is null;
-- Lucky Voice (from http://www.luckyvoice.ae/)
update public.spots set photo_url = '/venues/70000000-0000-0000-0000-000000000001.webp', photo_source = 'venue_site', photo_attribution = null
  where id = '70000000-0000-0000-0000-000000000001' and photo_url is null;
-- SoBe (from https://www.sobedubai.com/)
update public.spots set photo_url = '/venues/d0000000-0000-0000-0000-000000000002.webp', photo_source = 'venue_site', photo_attribution = null
  where id = 'd0000000-0000-0000-0000-000000000002' and photo_url is null;
-- Bar Du Port Dubai (from https://www.barduportdubai.com/)
update public.spots set photo_url = '/venues/c0890000-0000-0000-0001-00024a3e7239.webp', photo_source = 'venue_site', photo_attribution = null
  where id = 'c0890000-0000-0000-0001-00024a3e7239' and photo_url is null;
-- Buddha Bar (from http://www.buddhabar-dubai.com/)
update public.spots set photo_url = '/venues/c0890000-0000-0000-0001-000248df7c72.webp', photo_source = 'venue_site', photo_attribution = null
  where id = 'c0890000-0000-0000-0001-000248df7c72' and photo_url is null;
-- CÉ LA VI (from https://dxb.celavi.com/)
update public.spots set photo_url = '/venues/30000000-0000-0000-0000-000000000001.webp', photo_source = 'venue_site', photo_attribution = null
  where id = '30000000-0000-0000-0000-000000000001' and photo_url is null;
-- Terra Solis (from http://www.terrasolisdubai.com/)
update public.spots set photo_url = '/venues/30000000-0000-0000-0000-000000000002.webp', photo_source = 'venue_site', photo_attribution = null
  where id = '30000000-0000-0000-0000-000000000002' and photo_url is null;
-- Warehouse (from http://www.warehouse-dubai.com/)
update public.spots set photo_url = '/venues/c0890000-0000-0000-0001-0000de07cf66.webp', photo_source = 'venue_site', photo_attribution = null
  where id = 'c0890000-0000-0000-0001-0000de07cf66' and photo_url is null;
-- SEVEN Wellness Club (from https://seven.club/)
update public.spots set photo_url = '/venues/88000000-0000-0000-0000-000000000003.webp', photo_source = 'venue_site', photo_attribution = null
  where id = '88000000-0000-0000-0000-000000000003' and photo_url is null;

commit;
