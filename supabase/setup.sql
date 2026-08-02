-- ─────────────────────────────────────────────────────────────────
-- Dubai dinner decider — schema (v1)
-- Paste this into Supabase → SQL Editor → New query → Run.
-- Safe to re-run: it drops and recreates the four tables.
-- ─────────────────────────────────────────────────────────────────

drop table if exists rsvps cascade;
drop table if exists votes cascade;
drop table if exists plan_spots cascade;
drop table if exists plans cascade;
drop table if exists spots cascade;

-- Curated hangout places of any category. Pre-loaded so nobody researches.
create table spots (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    text not null default 'dinner', -- dinner | cafe | shisha | movie | ...
  area        text not null,
  cuisine     text not null,            -- or a type label for non-food categories
  price_band  text not null check (price_band in ('$', '$$', '$$$')),
  min_spend   int  not null,            -- AED per person
  open_till   text not null,            -- e.g. '12am', '3am'
  vibe        text not null,
  photo_url   text,                     -- curated now; places-API-ready later
  description text,                     -- a review blurb to help people decide
  booking_url text
);

-- A plan == one share link. The uuid IS the slug in the URL.
create table plans (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  category       text not null default 'dinner',
  area           text,
  deadline       timestamptz,
  status         text not null default 'open' check (status in ('open', 'decided')),
  winner_spot_id uuid references spots(id),
  -- the last mile: a decision becomes a real, committed event
  event_time     timestamptz,           -- when the outing actually is
  booking_owner  text,                  -- voter_name of whoever's booking
  booked         boolean not null default false,
  created_at     timestamptz not null default now()
);

-- The exactly-three options shown for a plan. (The "exactly 3" rule is
-- enforced in app logic + seed; the table itself just links them.)
create table plan_spots (
  plan_id uuid not null references plans(id) on delete cascade,
  spot_id uuid not null references spots(id) on delete cascade,
  primary key (plan_id, spot_id)
);

-- One row per (voter, spot). value = true means "yes".
-- The unique key lets us upsert, so a voter can change their mind and
-- vote once per spot without creating duplicates.
create table votes (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references plans(id) on delete cascade,
  spot_id    uuid not null references spots(id) on delete cascade,
  voter_name text not null,
  value      boolean not null,
  created_at timestamptz not null default now(),
  unique (plan_id, spot_id, voter_name)
);

create index votes_plan_idx on votes (plan_id);

-- One row per (voter, plan). coming = true means "I'm actually coming".
-- Headcount (not vote count) is what the booking uses.
create table rsvps (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references plans(id) on delete cascade,
  voter_name text not null,
  coming     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (plan_id, voter_name)
);

create index rsvps_plan_idx on rsvps (plan_id);

-- ── Row Level Security ─────────────────────────────────────────────
-- No auth in v1. Access is "you have the link." We turn RLS on so the
-- database isn't wide open by default, then grant exactly what the loop
-- needs to the anon role. Tradeoff: anyone with the anon key can write
-- votes and flip a plan's status. Acceptable for an MVP link-shared app;
-- v2 tightens this by moving writes behind an edge function.

alter table spots      enable row level security;
alter table plans      enable row level security;
alter table plan_spots enable row level security;
alter table votes      enable row level security;
alter table rsvps      enable row level security;

-- Everyone can read everything (the app is public by link).
create policy "read spots"      on spots      for select using (true);
create policy "read plans"      on plans      for select using (true);
create policy "read plan_spots" on plan_spots for select using (true);
create policy "read votes"      on votes      for select using (true);

-- Voting: insert and update your own vote rows.
create policy "cast votes"   on votes for insert with check (true);
create policy "change votes" on votes for update using (true) with check (true);

-- RSVPs: commit and change your mind.
create policy "read rsvps"   on rsvps for select using (true);
create policy "cast rsvps"   on rsvps for insert with check (true);
create policy "change rsvps" on rsvps for update using (true) with check (true);

-- Starting a plan (used by the create flow) + "decide for us" updates.
create policy "create plans"      on plans      for insert with check (true);
create policy "decide plans"      on plans      for update using (true) with check (true);
create policy "attach plan_spots" on plan_spots for insert with check (true);

-- ── Realtime ───────────────────────────────────────────────────────
-- Broadcast row changes so the vote screen updates live.
alter publication supabase_realtime add table votes;
alter publication supabase_realtime add table plans;
alter publication supabase_realtime add table rsvps;

-- ── seed ──
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
