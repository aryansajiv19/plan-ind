-- ─────────────────────────────────────────────────────────────────
-- Migration 003 — post-visit ratings (closes the feedback loop).
-- Additive & re-run safe. One rating per (plan, voter): stars + "again?".
-- spot_idx is for aggregating a place's ratings later ("haven't been yet"
-- / suggest well-rated spots).
-- ─────────────────────────────────────────────────────────────────

create table if not exists ratings (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references plans(id) on delete cascade,
  spot_id    uuid not null references spots(id) on delete cascade,
  voter_name text not null,
  stars      int  not null check (stars between 1 and 5),
  again      boolean not null,
  created_at timestamptz not null default now(),
  unique (plan_id, voter_name)
);

create index if not exists ratings_plan_idx on ratings (plan_id);
create index if not exists ratings_spot_idx on ratings (spot_id);

alter table ratings enable row level security;
drop policy if exists "read ratings"   on ratings;
drop policy if exists "cast ratings"   on ratings;
drop policy if exists "change ratings" on ratings;
create policy "read ratings"   on ratings for select using (true);
create policy "cast ratings"   on ratings for insert with check (true);
create policy "change ratings" on ratings for update using (true) with check (true);

do $$
begin
  alter publication supabase_realtime add table ratings;
exception when duplicate_object then null;
end $$;
