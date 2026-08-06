-- Adds starter inventory for the expanded Dubai plan picker.
-- Additive and re-run safe. Apply after migration-002.

insert into spots (id, name, category, area, cuisine, price_band, min_spend, open_till, vibe, booking_url) values
  -- nightlife
  ('81000000-0000-0000-0000-000000000001', 'Soho Garden Meydan', 'nightlife', 'Meydan', 'Nightclub', '$$$', 250, '4am', 'Large-scale club nights and international DJ sets', null),
  ('81000000-0000-0000-0000-000000000002', 'BLU Dubai', 'nightlife', 'Al Habtoor City', 'Nightclub', '$$$', 300, '4am', 'High-energy late nights with skyline views', null),
  ('81000000-0000-0000-0000-000000000003', 'SKY2.0 Dubai', 'nightlife', 'Dubai Design District', 'Nightclub', '$$$', 300, '4am', 'Open-air club atmosphere and headline sets', null),

  -- live music
  ('82000000-0000-0000-0000-000000000001', 'The Fridge', 'live_music', 'Alserkal Avenue', 'Independent music venue', '$$', 100, '11pm', 'Intimate local and regional performances in a warehouse setting', null),
  ('82000000-0000-0000-0000-000000000002', 'Q''s Bar and Lounge', 'live_music', 'Al Habtoor City', 'Live music lounge', '$$$', 250, '2am', 'Polished table-side sets in an intimate room', null),
  ('82000000-0000-0000-0000-000000000003', 'Hard Rock Cafe Dubai', 'live_music', 'Dubai Festival City', 'Live rock venue', '$$', 150, '1am', 'Familiar anthems, a full stage and an easy group setup', null),

  -- beach clubs
  ('83000000-0000-0000-0000-000000000001', 'DRIFT Beach Dubai', 'beach_club', 'One&Only Royal Mirage', 'Beach club', '$$$', 350, '8pm', 'Quiet luxury, a long pool and a polished beachfront lunch', null),
  ('83000000-0000-0000-0000-000000000002', 'Twiggy by La Cantine', 'beach_club', 'Dubai Creek', 'Beach club', '$$$', 350, '1am', 'Lagoon-side day beds that transition into dinner', null),
  ('83000000-0000-0000-0000-000000000003', 'O Beach Dubai', 'beach_club', 'Dubai Marina', 'Pool and beach club', '$$$', 350, '1am', 'Music-led pool days built for larger groups', null),

  -- water activities
  ('84000000-0000-0000-0000-000000000001', 'Aquaventure World', 'water', 'Palm Jumeirah', 'Water park', '$$$', 320, '7pm', 'A full day of slides, rapids and private beach time', null),
  ('84000000-0000-0000-0000-000000000002', 'Wild Wadi Waterpark', 'water', 'Jumeirah', 'Water park', '$$', 260, '6pm', 'Classic slides and wave pools beside Burj Al Arab', null),
  ('84000000-0000-0000-0000-000000000003', 'AquaFun Dubai', 'water', 'JBR', 'Inflatable water park', '$$', 155, '6pm', 'A large floating obstacle course just off the beach', null),

  -- padel
  ('85000000-0000-0000-0000-000000000001', 'Padel Pro One Central', 'padel', 'Dubai World Trade Centre', 'Padel club', '$$', 100, '12am', 'Central courts with convenient post-work slots', null),
  ('85000000-0000-0000-0000-000000000002', 'Padel Art', 'padel', 'Al Quoz', 'Padel club', '$$', 100, '12am', 'Design-forward indoor courts and a social crowd', null),
  ('85000000-0000-0000-0000-000000000003', 'World Padel Academy Dubai', 'padel', 'Al Quoz', 'Padel academy', '$$', 100, '12am', 'Multiple courts for casual games or coached sessions', null),

  -- adventure
  ('86000000-0000-0000-0000-000000000001', 'Deep Dive Dubai', 'adventure', 'Nad Al Sheba', 'Indoor diving', '$$$', 400, '8pm', 'A submerged city built for first dives and certified explorers', null),
  ('86000000-0000-0000-0000-000000000002', 'Aventura Parks', 'adventure', 'Mushrif Park', 'Ropes course', '$$', 185, '9pm', 'Tree-top circuits and zip lines with several difficulty levels', null),
  ('86000000-0000-0000-0000-000000000003', 'Sky Views Edge Walk', 'adventure', 'Downtown Dubai', 'Sky walk', '$$$', 500, '10pm', 'A hands-free ledge walk high above Downtown', null),

  -- arts and culture
  ('87000000-0000-0000-0000-000000000001', 'Jameel Arts Centre', 'culture', 'Jaddaf Waterfront', 'Contemporary art', '$', 0, '8pm', 'Thoughtful exhibitions, a sculpture park and calm creek views', null),
  ('87000000-0000-0000-0000-000000000002', 'Al Shindagha Museum', 'culture', 'Dubai Creek', 'Museum', '$', 50, '8pm', 'Dubai history told across restored creekside houses', null),
  ('87000000-0000-0000-0000-000000000003', 'Museum of the Future', 'culture', 'Trade Centre', 'Museum', '$$', 159, '9:30pm', 'Immersive exhibitions about technology, society and tomorrow', null),

  -- wellness
  ('88000000-0000-0000-0000-000000000001', 'Talise Spa Madinat Jumeirah', 'wellness', 'Madinat Jumeirah', 'Spa', '$$$', 500, '10pm', 'A resort spa with gardens, waterways and private treatment rooms', null),
  ('88000000-0000-0000-0000-000000000002', 'The Hundred Wellness Centre', 'wellness', 'Jumeirah', 'Wellness centre', '$$', 180, '8pm', 'Yoga, reformer, therapies and a calm neighbourhood setting', null),
  ('88000000-0000-0000-0000-000000000003', 'SEVEN Wellness Club', 'wellness', 'Al Quoz', 'Wellness club', '$$$', 300, '10pm', 'Training, recovery and social spaces under one roof', null),

  -- shopping
  ('89000000-0000-0000-0000-000000000001', 'The Dubai Mall', 'shopping', 'Downtown Dubai', 'Shopping district', '$$', 150, '12am', 'Flagship stores, food, entertainment and an easy full-day plan', null),
  ('89000000-0000-0000-0000-000000000002', 'Mall of the Emirates', 'shopping', 'Al Barsha', 'Shopping district', '$$', 150, '12am', 'A broad retail mix with dining, cinema and indoor skiing', null),
  ('89000000-0000-0000-0000-000000000003', 'Dubai Design District', 'shopping', 'Dubai Design District', 'Design district', '$$', 150, '11pm', 'Independent design, fashion pop-ups and considered cafes', null),

  -- family
  ('8a000000-0000-0000-0000-000000000001', 'OliOli', 'family', 'Al Quoz', 'Children''s museum', '$$', 139, '6pm', 'Hands-on galleries designed around making, movement and play', null),
  ('8a000000-0000-0000-0000-000000000002', 'Dubai Safari Park', 'family', 'Al Warqa', 'Wildlife park', '$', 50, '6pm', 'Large habitat zones, animal encounters and a full outdoor day', null),
  ('8a000000-0000-0000-0000-000000000003', 'KidZania Dubai', 'family', 'Downtown Dubai', 'Role-play city', '$$', 195, '10pm', 'A child-sized city with dozens of hands-on professions', null),

  -- city escapes
  ('8b000000-0000-0000-0000-000000000001', 'Bab Al Shams', 'escape', 'Dubai Desert', 'Desert resort', '$$$', 600, '12am', 'A considered desert reset within driving distance of the city', null),
  ('8b000000-0000-0000-0000-000000000002', 'Hatta Dome Park', 'escape', 'Hatta', 'Mountain glamping', '$$$', 500, '12am', 'Private domes overlooking rugged Hajar Mountain terrain', null),
  ('8b000000-0000-0000-0000-000000000003', 'Anantara World Islands Dubai', 'escape', 'World Islands', 'Island resort', '$$$', 700, '12am', 'A boat-access island stay that feels removed from the city', null)
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  area = excluded.area,
  cuisine = excluded.cuisine,
  price_band = excluded.price_band,
  min_spend = excluded.min_spend,
  open_till = excluded.open_till,
  vibe = excluded.vibe,
  booking_url = excluded.booking_url;
