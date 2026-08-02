-- ─────────────────────────────────────────────────────────────────
-- Migration 002 — the last mile + multi-category foundation
-- Additive & re-run safe: preserves existing data. Paste → Run.
-- ─────────────────────────────────────────────────────────────────

-- Plans: turn a decision into a committed event.
alter table plans add column if not exists event_time    timestamptz;
alter table plans add column if not exists booking_owner text;
alter table plans add column if not exists booked        boolean not null default false;

-- Spots: multi-category + richer cards (curated now, places-API-ready later).
alter table spots add column if not exists category    text not null default 'dinner';
alter table spots add column if not exists photo_url   text;
alter table spots add column if not exists description text;

-- RSVPs: who's actually coming. Mirrors votes — upsert + realtime.
create table if not exists rsvps (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references plans(id) on delete cascade,
  voter_name text not null,
  coming     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (plan_id, voter_name)
);
create index if not exists rsvps_plan_idx on rsvps (plan_id);

alter table rsvps enable row level security;
drop policy if exists "read rsvps"   on rsvps;
drop policy if exists "cast rsvps"   on rsvps;
drop policy if exists "change rsvps" on rsvps;
create policy "read rsvps"   on rsvps for select using (true);
create policy "cast rsvps"   on rsvps for insert with check (true);
create policy "change rsvps" on rsvps for update using (true) with check (true);

-- Realtime for live headcount (safe if already added).
do $$
begin
  alter publication supabase_realtime add table rsvps;
exception when duplicate_object then null;
end $$;
