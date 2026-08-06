-- Progressive pool voting + saved custom places.
-- Additive and backward-compatible: existing plans remain one-round finals.

alter table spots add column if not exists source text not null default 'curated';
alter table spots add column if not exists visibility text not null default 'community';
alter table spots add column if not exists created_by_user_id uuid references auth.users(id) on delete cascade;
alter table spots add column if not exists address text;
alter table spots add column if not exists latitude double precision;
alter table spots add column if not exists longitude double precision;

alter table spots drop constraint if exists spots_source_check;
alter table spots add constraint spots_source_check check (source in ('curated', 'custom'));
alter table spots drop constraint if exists spots_visibility_check;
alter table spots add constraint spots_visibility_check check (visibility in ('private', 'friends', 'community'));
alter table spots drop constraint if exists spots_custom_owner_check;
alter table spots add constraint spots_custom_owner_check check (
  source = 'curated' or created_by_user_id is not null
);

create index if not exists spots_owner_idx on spots (created_by_user_id) where source = 'custom';

alter table plans add column if not exists stage text not null default 'final';
alter table plans add column if not exists pool_count smallint not null default 1;
alter table plans drop constraint if exists plans_stage_check;
alter table plans add constraint plans_stage_check check (stage in ('pool', 'final', 'decided'));
alter table plans drop constraint if exists plans_pool_count_check;
alter table plans add constraint plans_pool_count_check check (pool_count between 1 and 6);

alter table plan_spots add column if not exists pool_number smallint not null default 1;
alter table plan_spots add column if not exists advanced boolean not null default false;
alter table plan_spots drop constraint if exists plan_spots_pool_number_check;
alter table plan_spots add constraint plan_spots_pool_number_check check (pool_number between 1 and 6);
create index if not exists plan_spots_pool_idx on plan_spots (plan_id, pool_number);

alter table votes add column if not exists phase text not null default 'final';
alter table votes add column if not exists pool_number smallint not null default 0;
alter table votes drop constraint if exists votes_phase_check;
alter table votes add constraint votes_phase_check check (phase in ('pool', 'final'));
alter table votes drop constraint if exists votes_pool_number_check;
alter table votes add constraint votes_pool_number_check check (pool_number between 0 and 6);
alter table votes drop constraint if exists votes_plan_id_spot_id_voter_name_key;
create unique index if not exists votes_round_choice_unique
  on votes (plan_id, spot_id, voter_name, phase, pool_number);
create index if not exists votes_round_idx on votes (plan_id, phase, pool_number);

drop policy if exists "read spots" on spots;
create policy "read spots" on spots for select using (
  source = 'curated'
  or visibility = 'community'
  or created_by_user_id = auth.uid()
  or exists (select 1 from plan_spots ps where ps.spot_id = spots.id)
);

drop policy if exists "create custom spots" on spots;
drop policy if exists "update own custom spots" on spots;
drop policy if exists "delete own custom spots" on spots;
create policy "create custom spots" on spots for insert with check (
  source = 'custom' and created_by_user_id = auth.uid()
);
create policy "update own custom spots" on spots for update
  using (source = 'custom' and created_by_user_id = auth.uid())
  with check (source = 'custom' and created_by_user_id = auth.uid());
create policy "delete own custom spots" on spots for delete
  using (source = 'custom' and created_by_user_id = auth.uid());

drop policy if exists "advance plan_spots" on plan_spots;
create policy "advance plan_spots" on plan_spots for update using (true) with check (true);

