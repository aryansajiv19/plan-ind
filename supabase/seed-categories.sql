-- ─────────────────────────────────────────────────────────────────
-- Curated places for the multi-category picker (v1 starter set).
-- Additive & re-run safe: clears only the non-dinner categories, then
-- re-inserts them. Dinner spots + existing plans are untouched.
-- Run AFTER migration-002 (needs spots.category).
-- NOTE: venue details are a starter curation — refine as needed.
-- ─────────────────────────────────────────────────────────────────

delete from spots where category <> 'dinner';

insert into spots (id, name, category, area, cuisine, price_band, min_spend, open_till, vibe, booking_url) values
  -- cafe
  ('c0000000-0000-0000-0000-000000000001', 'Tom & Serg',        'cafe', 'Al Quoz',        'Coffee & brunch',    '$$',  90, '6pm',   'Warehouse brunch OG, always a wait for a reason', null),
  ('c0000000-0000-0000-0000-000000000002', '%Arabica JBR',      'cafe', 'JBR',            'Specialty coffee',   '$',   35, '11pm',  'Minimalist, serious beans, sea breeze', null),
  ('c0000000-0000-0000-0000-000000000003', 'Common Grounds',    'cafe', 'JLT',            'Coffee & cake',      '$$',  70, '11pm',  'Cozy booths, enormous cakes, reliable', null),
  ('c0000000-0000-0000-0000-000000000004', 'One Life Kitchen',  'cafe', 'Design District','Coffee & healthy',   '$$',  80, '8pm',   'Plants everywhere, calm, laptop-friendly', null),
  -- shisha
  ('d0000000-0000-0000-0000-000000000001', 'QDs',               'shisha', 'Dubai Creek',  'Shisha & grills',    '$$', 150, '1:30am','Creekside cushions, breezy, a classic', null),
  ('d0000000-0000-0000-0000-000000000002', 'SoBe',              'shisha', 'Palm Jumeirah','Rooftop shisha',     '$$$',250, '2am',   'Ibiza-style rooftop, sunset crowd', null),
  ('d0000000-0000-0000-0000-000000000003', 'Shimmers',          'shisha', 'Jumeirah Beach','Beach shisha',      '$$', 180, '1am',   'Toes in the sand, Gulf right there', null),
  ('d0000000-0000-0000-0000-000000000004', 'Iris',              'shisha', 'The Oberoi',   'Lounge & shisha',    '$$$',220, '2am',   'Dressy rooftop lounge, DJ nights', null),
  -- movie
  ('e0000000-0000-0000-0000-000000000001', 'Cinema Akil',       'movie', 'Al Serkal Avenue','Arthouse cinema',  '$',   45, '12am',  'Indie & classics, the Gulf''s only arthouse', null),
  ('e0000000-0000-0000-0000-000000000002', 'Roxy Cinemas',      'movie', 'City Walk',     'Luxury cinema',      '$$',  90, '1am',   'Recliners, blankets, full menu to your seat', null),
  ('e0000000-0000-0000-0000-000000000003', 'Reel Cinemas',      'movie', 'Dubai Mall',    'Blockbuster cinema', '$$',  75, '1am',   'Biggest screens in the city, dine-in', null),
  ('e0000000-0000-0000-0000-000000000004', 'VOX Cinemas',       'movie', 'Mall of the Emirates','Cinema',       '$',   55, '1am',   'Reliable multiplex, IMAX & 4DX', null),
  -- games
  ('f0000000-0000-0000-0000-000000000001', 'Hub Zero',          'games', 'City Walk',     'Arcade & VR',        '$$', 120, '11pm',  'Gaming park, VR, ropes course', null),
  ('f0000000-0000-0000-0000-000000000002', 'Bounce',            'games', 'Al Quoz',       'Trampoline park',    '$$',  95, '10pm',  'Freejumping, dodgeball, wall runs', null),
  ('f0000000-0000-0000-0000-000000000003', 'Dubai Bowling Centre','games','Al Quoz',      'Bowling',            '$',   60, '12am',  'Old-school lanes, zero fuss', null),
  ('f0000000-0000-0000-0000-000000000004', 'The Smash Room',    'games', 'Al Quoz',       'Rage room',          '$$', 130, '9pm',   'Smash plates & electronics, stress gone', null),
  -- brunch
  ('10000000-0000-0000-0000-000000000001', 'Reform Social & Grill','brunch','The Lakes',  'Garden brunch',      '$$', 250, '4pm',   'Relaxed garden brunch, dog-friendly lawn', null),
  ('10000000-0000-0000-0000-000000000002', 'Brasserie 2.0',     'brunch', 'Le Royal Meridien','French brunch',  '$$$',350, '4pm',   'Chic French, live cooking stations', null),
  ('10000000-0000-0000-0000-000000000003', 'Ninive',            'brunch', 'Emirates Towers','Levantine brunch', '$$', 295, '4pm',   'Bedouin-tent setting, mezze galore', null),
  ('10000000-0000-0000-0000-000000000004', 'Saffron',           'brunch', 'Atlantis',     'Mega brunch',        '$$$',450, '4pm',   'Legendary over-the-top feast', null),
  -- dessert
  ('20000000-0000-0000-0000-000000000001', 'Brix Dessert Bar',  'dessert','Al Wasl',      'Dessert bar',        '$$',  70, '12am',  'Plated desserts, chocolate everything', null),
  ('20000000-0000-0000-0000-000000000002', 'Scoopi Cafe',       'dessert','Al Wasl',      'Ice cream',          '$$',  55, '11pm',  'Wild gelato, gold-leaf sundaes', null),
  ('20000000-0000-0000-0000-000000000003', 'Black Tap',         'dessert','Jumeirah',     'Shakes & sweets',    '$$',  80, '12am',  'CrazyShakes tower over the table', null),
  ('20000000-0000-0000-0000-000000000004', 'Cocoa Room',        'dessert','JLT',          'Cakes & coffee',     '$$',  65, '12am',  'Giant cakes, comfy corners', null),
  -- vibes
  ('30000000-0000-0000-0000-000000000001', 'CÉ LA VI',          'vibes',  'Address Sky View','Rooftop lounge',  '$$$',300, '2am',   '54th-floor skyline, sleek crowd', null),
  ('30000000-0000-0000-0000-000000000002', 'Terra Solis',       'vibes',  'Dubai Desert', 'Desert lounge',      '$$', 180, '1am',   'Tomorrowland desert escape, fire pits', null),
  ('30000000-0000-0000-0000-000000000003', 'Koko Bay',          'vibes',  'Palm Jumeirah','Beach lounge',       '$$$',250, '2am',   'Bali vibes, sunset cocktails', null),
  ('30000000-0000-0000-0000-000000000004', 'The Nine',          'vibes',  'Address Dubai Mall','Gastropub',     '$$', 160, '2am',   'Dark-wood cosy, live music', null),
  -- beach
  ('40000000-0000-0000-0000-000000000001', 'Kite Beach',        'beach',  'Umm Suqeim',   'Public beach',       '$',   30, '10pm',  'Skate, volleyball, food trucks, sunset', null),
  ('40000000-0000-0000-0000-000000000002', 'La Mer',            'beach',  'Jumeirah',     'Beachfront strip',   '$$',  90, '12am',  'Beach + cafes + street art', null),
  ('40000000-0000-0000-0000-000000000003', 'Cove Beach',        'beach',  'Caesars Palace','Beach club',        '$$$',350, '1am',   'Chic loungers, DJ, pool & sea', null),
  ('40000000-0000-0000-0000-000000000004', 'Nikki Beach',       'beach',  'Pearl Jumeirah','Beach club',        '$$$',400, '1am',   'Day-party energy by the water', null),
  -- outdoors
  ('50000000-0000-0000-0000-000000000001', 'Al Qudra Lakes',    'outdoors','Seih Al Salam','Desert lakes',      '$',   20, '10pm',  'Cycle, picnic, flamingos at dawn', null),
  ('50000000-0000-0000-0000-000000000002', 'Hatta Wadi Hub',    'outdoors','Hatta',       'Mountain activities','$$', 150, '6pm',   'Kayaking, hikes, mountain air', null),
  ('50000000-0000-0000-0000-000000000003', 'Dubai Marina Walk', 'outdoors','Dubai Marina','Waterfront walk',    '$',   40, '12am',  'Yacht-lined stroll, endless cafes', null),
  ('50000000-0000-0000-0000-000000000004', 'The Green Planet',  'outdoors','City Walk',   'Indoor rainforest',  '$$', 130, '6pm',   'Bio-dome jungle, sloths & birds', null),
  -- sports
  ('60000000-0000-0000-0000-000000000001', 'The Huddle Sports Bar','sports','Al Barsha',  'Sports bar',         '$$',  90, '2am',   'Every match on, wings & pitchers', null),
  ('60000000-0000-0000-0000-000000000002', 'Garage Dubai',      'sports', 'Jumeirah',     'Sports bar',         '$$', 100, '3am',   'Screens everywhere, matchday roar', null),
  ('60000000-0000-0000-0000-000000000003', 'Kickers Indoor Football','sports','Al Quoz',  '5-a-side pitch',     '$$',  60, '12am',  'Book a pitch, settle it on the field', null),
  ('60000000-0000-0000-0000-000000000004', 'InSportz Club',     'sports', 'Al Quoz',      'Indoor courts',      '$$',  55, '11pm',  'Football, cricket, basketball courts', null),
  -- karaoke
  ('70000000-0000-0000-0000-000000000001', 'Lucky Voice',       'karaoke','Grand Millennium','Karaoke rooms',   '$$', 120, '3am',   'Private booths, cheesy anthems', null),
  ('70000000-0000-0000-0000-000000000002', 'Bla Bla',           'karaoke','JBR',          'Bar & karaoke',      '$$', 150, '3am',   '45 bars, big nights, karaoke corner', null),
  ('70000000-0000-0000-0000-000000000003', 'Hummingbird',       'karaoke','JW Marriott Marquis','Karaoke lounge','$$$',200,'3am',   'Glam lounge, live band backing', null),
  ('70000000-0000-0000-0000-000000000004', 'McGettigan''s',     'karaoke','JLT',          'Pub karaoke',        '$$', 110, '2am',   'Irish pub sing-alongs, lively', null);
