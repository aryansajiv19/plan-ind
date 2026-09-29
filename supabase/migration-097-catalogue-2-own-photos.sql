-- Migration 097: the venue's own photo for 35 of 095's venues.
--
-- Each is the venue's own website image, checked by hand (logos, posters,
-- menus and shared hotel skylines rejected), kept only where the venue's
-- Google match was approved, served from public/venues/<id>.webp. Apply only
-- after the deploy that ships the files. Fills a null only. Re-run safe.

begin;

-- Momo & More (from https://momoandmore.com/)
update public.spots set photo_url = '/venues/c0900000-0000-0000-0001-0001de50d81a.webp', photo_source = 'venue_site', photo_attribution = null where id = 'c0900000-0000-0000-0001-0001de50d81a' and photo_url is null;
-- Al Dawaar (from https://www.hyattrestaurants.com/en/dubai/restaurant/al-dawaar-revolving-restaurant)
update public.spots set photo_url = '/venues/c0900000-0000-0000-0001-0000dd4920dd.webp', photo_source = 'venue_site', photo_attribution = null where id = 'c0900000-0000-0000-0001-0000dd4920dd' and photo_url is null;
-- Casa Mia (from http://www.casamia-dubai.com/)
update public.spots set photo_url = '/venues/c0900000-0000-0000-0001-0000de07cf61.webp', photo_source = 'venue_site', photo_attribution = null where id = 'c0900000-0000-0000-0001-0000de07cf61' and photo_url is null;
-- Sukhothai (from http://www.sukhothai-dubai.com/)
update public.spots set photo_url = '/venues/c0900000-0000-0000-0001-0000de07cf62.webp', photo_source = 'venue_site', photo_attribution = null where id = 'c0900000-0000-0000-0001-0000de07cf62' and photo_url is null;
-- Le Flamant Rose (from https://leflamantrose.ae/)
update public.spots set photo_url = '/venues/c0900000-0000-0000-0001-00034ddc15cb.webp', photo_source = 'venue_site', photo_attribution = null where id = 'c0900000-0000-0000-0001-00034ddc15cb' and photo_url is null;
-- Il Pastaio Dubai (from https://www.ilpastaiodubai.ae/)
update public.spots set photo_url = '/venues/c0900000-0000-0000-0001-0002967011ea.webp', photo_source = 'venue_site', photo_attribution = null where id = 'c0900000-0000-0000-0001-0002967011ea' and photo_url is null;
-- Farsi (from http://www.farsi-restaurant.com/)
update public.spots set photo_url = '/venues/c0900000-0000-0000-0001-00018440d40a.webp', photo_source = 'venue_site', photo_attribution = null where id = 'c0900000-0000-0000-0001-00018440d40a' and photo_url is null;
-- Afghan Khorasan Restaurant (from https://afghankhorasankabab.shop/)
update public.spots set photo_url = '/venues/c0900000-0000-0000-0001-0000fb42f423.webp', photo_source = 'venue_site', photo_attribution = null where id = 'c0900000-0000-0000-0001-0000fb42f423' and photo_url is null;
-- Lopo Pizzeria (from http://www.lopopizzeria.com/)
update public.spots set photo_url = '/venues/c0900000-0000-0000-0001-000235964ec8.webp', photo_source = 'venue_site', photo_attribution = null where id = 'c0900000-0000-0000-0001-000235964ec8' and photo_url is null;
-- Hengchen (from https://hengchen.ae/motor-city/)
update public.spots set photo_url = '/venues/c0900000-0000-0000-0001-0000f41e2e8a.webp', photo_source = 'venue_site', photo_attribution = null where id = 'c0900000-0000-0000-0001-0000f41e2e8a' and photo_url is null;
-- The Observatory (from https://www.observatorylounge.ae/)
update public.spots set photo_url = '/venues/c0900000-0000-0000-0001-0000de0aeb23.webp', photo_source = 'venue_site', photo_attribution = null where id = 'c0900000-0000-0000-0001-0000de0aeb23' and photo_url is null;
-- Zengo (from http://www.zengo-dubai.com/)
update public.spots set photo_url = '/venues/c0900000-0000-0000-0001-0001459ba950.webp', photo_source = 'venue_site', photo_attribution = null where id = 'c0900000-0000-0000-0001-0001459ba950' and photo_url is null;
-- Al Khayma (from http://www.alkhaima-dubai.com/)
update public.spots set photo_url = '/venues/c0900000-0000-0000-0001-00004809e103.webp', photo_source = 'venue_site', photo_attribution = null where id = 'c0900000-0000-0000-0001-00004809e103' and photo_url is null;
-- Bussola (from https://www.destinationminaseyahi.com/dining/bussola)
update public.spots set photo_url = '/venues/c0900000-0000-0000-0001-000056c68c0a.webp', photo_source = 'venue_site', photo_attribution = null where id = 'c0900000-0000-0000-0001-000056c68c0a' and photo_url is null;
-- Unwind Speciality Boardgame Cafe (from https://unwinddubai.com/)
update public.spots set photo_url = '/venues/c0900000-0000-0000-0001-00029f4776d7.webp', photo_source = 'venue_site', photo_attribution = null where id = 'c0900000-0000-0000-0001-00029f4776d7' and photo_url is null;
-- L'eto (from https://letocaffe.com/)
update public.spots set photo_url = '/venues/c0900000-0000-0000-0001-000290647257.webp', photo_source = 'venue_site', photo_attribution = null where id = 'c0900000-0000-0000-0001-000290647257' and photo_url is null;
-- Unwind Speciality Boardgame Cafe (from https://unwinddubai.com/)
update public.spots set photo_url = '/venues/c0900000-0000-0000-0001-0002b46155ef.webp', photo_source = 'venue_site', photo_attribution = null where id = 'c0900000-0000-0000-0001-0002b46155ef' and photo_url is null;
-- The Cars Cafe (from http://www.thecarscafe.com/)
update public.spots set photo_url = '/venues/c0900000-0000-0000-0001-00034a96d759.webp', photo_source = 'venue_site', photo_attribution = null where id = 'c0900000-0000-0000-0001-00034a96d759' and photo_url is null;
-- 1762 Stripped (from https://1762.ae/)
update public.spots set photo_url = '/venues/c0900000-0000-0000-0001-000138c78f3b.webp', photo_source = 'venue_site', photo_attribution = null where id = 'c0900000-0000-0000-0001-000138c78f3b' and photo_url is null;
-- Hengchen (from https://hengchen.ae/silicon-oasis/)
update public.spots set photo_url = '/venues/c0900000-0000-0000-0001-0002d1dcaa19.webp', photo_source = 'venue_site', photo_attribution = null where id = 'c0900000-0000-0000-0001-0002d1dcaa19' and photo_url is null;
-- Dubai Kartdrome (from http://www.dubaiautodrome.com/arrive-drive-2/)
update public.spots set photo_url = '/venues/c0900000-0000-0000-0001-0000dc0e82fc.webp', photo_source = 'venue_site', photo_attribution = null where id = 'c0900000-0000-0000-0001-0000dc0e82fc' and photo_url is null;
-- Dubai Hills Park (from https://www.emaar.com/)
update public.spots set photo_url = '/venues/c0900000-0000-0000-0002-0000331fcc2c.webp', photo_source = 'venue_site', photo_attribution = null where id = 'c0900000-0000-0000-0002-0000331fcc2c' and photo_url is null;
-- Mercedes-Benz Off-Road Experience Center (from https://mercedesbenzbrandcenter.ae/offRoadExp)
update public.spots set photo_url = '/venues/c0900000-0000-0000-0001-0002d138ee37.webp', photo_source = 'venue_site', photo_attribution = null where id = 'c0900000-0000-0000-0001-0002d138ee37' and photo_url is null;
-- Danube Sports World (from https://danubesportsworld.com/)
update public.spots set photo_url = '/venues/c0900000-0000-0000-0002-000041d528af.webp', photo_source = 'venue_site', photo_attribution = null where id = 'c0900000-0000-0000-0002-000041d528af' and photo_url is null;
-- The Els Club (from http://www.elsclubdubai.com/)
update public.spots set photo_url = '/venues/c0900000-0000-0000-0003-00000051b194.webp', photo_source = 'venue_site', photo_attribution = null where id = 'c0900000-0000-0000-0003-00000051b194' and photo_url is null;
-- The Track Meydan Golf Club (from http://www.meydangolf.com/)
update public.spots set photo_url = '/venues/c0900000-0000-0000-0002-000000a370f0.webp', photo_source = 'venue_site', photo_attribution = null where id = 'c0900000-0000-0000-0002-000000a370f0' and photo_url is null;
-- Lock, Stock & Barrel (from https://eu1.hubs.ly/H0sMLpP0)
update public.spots set photo_url = '/venues/c0900000-0000-0000-0001-000106824d6b.webp', photo_source = 'venue_site', photo_attribution = null where id = 'c0900000-0000-0000-0001-000106824d6b' and photo_url is null;
-- Cielo Sky Lounge (from https://www.hyattrestaurants.com/en/dubai/bar/cielo-sky-lounge)
update public.spots set photo_url = '/venues/c0900000-0000-0000-0001-00011cf78fb2.webp', photo_source = 'venue_site', photo_attribution = null where id = 'c0900000-0000-0000-0001-00011cf78fb2' and photo_url is null;
-- Level 43 Sky Lounge Bar & Resto (from https://www.level43skylounge.com/)
update public.spots set photo_url = '/venues/c0900000-0000-0000-0001-000117fcc1fd.webp', photo_source = 'venue_site', photo_attribution = null where id = 'c0900000-0000-0000-0001-000117fcc1fd' and photo_url is null;
-- NEOS (from http://www.addresshotels.com/)
update public.spots set photo_url = '/venues/c0900000-0000-0000-0001-0000cc8d04c8.webp', photo_source = 'venue_site', photo_attribution = null where id = 'c0900000-0000-0000-0001-0000cc8d04c8' and photo_url is null;
-- Charlie's Pub (from https://www.charliespubdubai.com/)
update public.spots set photo_url = '/venues/c0900000-0000-0000-0001-0001f5b63a37.webp', photo_source = 'venue_site', photo_attribution = null where id = 'c0900000-0000-0000-0001-0001f5b63a37' and photo_url is null;
-- The Dubliner's (from http://www.thedubliners-dubai.com/)
update public.spots set photo_url = '/venues/c0900000-0000-0000-0001-0000de07cf67.webp', photo_source = 'venue_site', photo_attribution = null where id = 'c0900000-0000-0000-0001-0000de07cf67' and photo_url is null;
-- Bliss Lounge (from http://www.blissloungedubai.com/)
update public.spots set photo_url = '/venues/c0900000-0000-0000-0001-0003088786fd.webp', photo_source = 'venue_site', photo_attribution = null where id = 'c0900000-0000-0000-0001-0003088786fd' and photo_url is null;
-- City Social (from https://www.citysocialdubai.com/)
update public.spots set photo_url = '/venues/c0900000-0000-0000-0001-0002ddcd4635.webp', photo_source = 'venue_site', photo_attribution = null where id = 'c0900000-0000-0000-0001-0002ddcd4635' and photo_url is null;
-- Shades (from http://www.shades-dubai.com/)
update public.spots set photo_url = '/venues/c0900000-0000-0000-0001-0001459b9562.webp', photo_source = 'venue_site', photo_attribution = null where id = 'c0900000-0000-0000-0001-0001459b9562' and photo_url is null;

commit;
