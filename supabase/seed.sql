-- ─────────────────────────────────────────────────────────────────
-- Seed data — run AFTER schema.sql.
-- 5 Dubai dinner spots + one demo plan (fixed uuid) that deals 3 of
-- them, so the vote screen has a link to test against immediately.
-- Safe to re-run: it clears the four tables first.
-- ─────────────────────────────────────────────────────────────────

delete from rsvps;
delete from votes;
delete from plan_spots;
delete from plans;
delete from spots;

insert into spots (id, name, area, cuisine, price_band, min_spend, open_till, vibe, booking_url) values
  ('a0000000-0000-0000-0000-000000000001', 'Reif Japanese Kushiyaki', 'Dubai Hills', 'Japanese',  '$$$', 250, '12am',   'Smoky skewers, tight room, always buzzing', 'https://www.reifother.com'),
  ('a0000000-0000-0000-0000-000000000002', 'Ravi Restaurant',         'Al Satwa',    'Pakistani', '$',    45, '3am',    'Legendary cheap eats, plastic chairs, no bookings', null),
  ('a0000000-0000-0000-0000-000000000003', '3Fils',                   'Jumeirah',    'Seafood',   '$$',  180, '11pm',   'Marina-side, no-reservations, quietly excellent', null),
  ('a0000000-0000-0000-0000-000000000004', 'Bu Qtair',                'Umm Suqeim',  'Seafood',   '$',    60, '11:30pm','Fry-shack on the beach, catch of the day', null),
  ('a0000000-0000-0000-0000-000000000005', 'Tresind Studio',          'DIFC',        'Indian',    '$$$', 550, '11pm',   'Theatrical tasting menu, book weeks ahead', 'https://www.tresindstudio.com');

-- Demo plan for building/testing the vote screen.
insert into plans (id, title, category, area, deadline, status) values
  ('11111111-1111-1111-1111-111111111111', 'Where are we eating Thursday?', 'dinner', 'Dubai', now() + interval '3 hours', 'open');

-- Deal exactly three of the five into the demo plan.
insert into plan_spots (plan_id, spot_id) values
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000002'),
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000003');
