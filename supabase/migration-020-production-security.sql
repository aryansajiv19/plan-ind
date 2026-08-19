-- Production security boundary. Apply after migration 019.
-- Existing share URLs remain valid: the UUID in /plan/:id is the capability,
-- but a browser must redeem it into an authenticated guest membership before
-- tables or Realtime will expose the plan.

create extension if not exists pgcrypto with schema extensions;

-- ── Plan capabilities ─────────────────────────────────────────────

create table if not exists plan_access (
  plan_id uuid not null references plans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (plan_id, user_id)
);
create index if not exists plan_access_user_idx on plan_access(user_id, plan_id);
alter table plan_access enable row level security;

drop policy if exists "read own plan access" on plan_access;
create policy "read own plan access" on plan_access for select to authenticated
  using (user_id = (select auth.uid()));

insert into plan_access(plan_id, user_id)
select id, created_by_user_id from plans where created_by_user_id is not null
on conflict do nothing;

create or replace function claim_plan_access(p_plan_id uuid)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not exists (select 1 from plans where id = p_plan_id) then return false; end if;
  insert into plan_access(plan_id, user_id) values (p_plan_id, uid)
  on conflict do nothing;
  return true;
end; $$;
revoke all on function claim_plan_access(uuid) from public;
grant execute on function claim_plan_access(uuid) to authenticated;

drop policy if exists "read plans" on plans;
drop policy if exists "read plan_spots" on plan_spots;
drop policy if exists "read votes" on votes;
drop policy if exists "read rsvps" on rsvps;
drop policy if exists "read ratings" on ratings;

create policy "read accessible plans" on plans for select to authenticated using (
  created_by_user_id = (select auth.uid()) or exists (
    select 1 from plan_access a where a.plan_id = plans.id and a.user_id = (select auth.uid())
  )
);
create policy "read accessible plan spots" on plan_spots for select to authenticated using (
  exists (select 1 from plan_access a where a.plan_id = plan_spots.plan_id and a.user_id = (select auth.uid()))
);
create policy "read accessible votes" on votes for select to authenticated using (
  exists (select 1 from plan_access a where a.plan_id = votes.plan_id and a.user_id = (select auth.uid()))
);
create policy "read accessible rsvps" on rsvps for select to authenticated using (
  exists (select 1 from plan_access a where a.plan_id = rsvps.plan_id and a.user_id = (select auth.uid()))
);
create policy "read accessible ratings" on ratings for select to authenticated using (
  exists (select 1 from plan_access a where a.plan_id = ratings.plan_id and a.user_id = (select auth.uid()))
);

drop policy if exists "read spots" on spots;
create policy "read permitted spots" on spots for select to authenticated using (
  source = 'curated'
  or visibility = 'community'
  or created_by_user_id = (select auth.uid())
  or exists (
    select 1 from plan_spots ps
    join plan_access a on a.plan_id = ps.plan_id
    where ps.spot_id = spots.id and a.user_id = (select auth.uid())
  )
);

-- Every participant write must follow a claimed plan membership. This trigger
-- also covers direct future functions, so a forgotten RPC check cannot reopen
-- the boundary.
create or replace function enforce_plan_membership()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not exists (
    select 1 from plan_access a where a.plan_id = new.plan_id and a.user_id = auth.uid()
  ) then
    raise exception 'Plan access required' using errcode = '42501';
  end if;
  return new;
end; $$;

drop trigger if exists votes_require_plan_access on votes;
create trigger votes_require_plan_access before insert or update on votes
for each row execute function enforce_plan_membership();
drop trigger if exists rsvps_require_plan_access on rsvps;
create trigger rsvps_require_plan_access before insert or update on rsvps
for each row execute function enforce_plan_membership();
drop trigger if exists ratings_require_plan_access on ratings;
create trigger ratings_require_plan_access before insert or update on ratings
for each row execute function enforce_plan_membership();

revoke execute on function cast_plan_vote(uuid, uuid, text, boolean, text, smallint, text) from anon;
revoke execute on function set_plan_rsvp(uuid, text, boolean, text, text) from anon;
revoke execute on function rate_plan(uuid, uuid, text, integer, boolean, text) from anon;
grant execute on function cast_plan_vote(uuid, uuid, text, boolean, text, smallint, text) to authenticated;
grant execute on function set_plan_rsvp(uuid, text, boolean, text, text) to authenticated;
grant execute on function rate_plan(uuid, uuid, text, integer, boolean, text) to authenticated;

-- ── Transactional, server-authoritative plan creation ─────────────

create or replace function clean_app_text(value text, maximum integer)
returns text language sql immutable set search_path = pg_catalog as $$
  select left(trim(regexp_replace(translate(coalesce(value, ''),
    chr(8206)||chr(8207)||chr(8234)||chr(8235)||chr(8236)||chr(8237)||chr(8238)||chr(8294)||chr(8295)||chr(8296)||chr(8297),
    ''), '[[:cntrl:]]', '', 'g')), maximum)
$$;

create or replace function sanitize_participant_text()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.voter_name := clean_app_text(new.voter_name, 40);
  if new.voter_name = '' then raise exception 'A participant name is required' using errcode='22023'; end if;
  return new;
end; $$;
drop trigger if exists votes_sanitize_text on votes;
create trigger votes_sanitize_text before insert or update on votes
for each row execute function sanitize_participant_text();
drop trigger if exists rsvps_sanitize_text on rsvps;
create trigger rsvps_sanitize_text before insert or update on rsvps
for each row execute function sanitize_participant_text();
drop trigger if exists ratings_sanitize_text on ratings;
create trigger ratings_sanitize_text before insert or update on ratings
for each row execute function sanitize_participant_text();

create or replace function create_secure_plan(p_plan jsonb, p_spot_ids uuid[])
returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  uid uuid := auth.uid();
  title_value text := clean_app_text(p_plan->>'title', 60);
  category_value text := clean_app_text(p_plan->>'category', 40);
  deadline_value timestamptz;
  age_value integer;
  required_age integer;
  plan_id_value uuid;
  host_token_value text;
  budget_value integer;
  radius_value integer;
  latitude_value double precision;
  longitude_value double precision;
  vibe_values text[] := '{}';
  avoid_values text[] := '{}';
begin
  if uid is null or coalesce(auth.jwt()->>'is_anonymous', 'false') = 'true' then
    raise exception 'A permanent account is required' using errcode = '42501';
  end if;
  if p_plan is null or jsonb_typeof(p_plan) <> 'object'
     or (p_plan - array['title','category','area','deadline','budgetPerPerson','originLabel','originLatitude','originLongitude','radiusKm','smartBrief','vibePreferences','avoidPreferences']) <> '{}'::jsonb then
    raise exception 'Unsupported plan fields' using errcode = '22023';
  end if;
  if title_value = '' or category_value = '' then
    raise exception 'A title and category are required' using errcode = '22023';
  end if;
  if cardinality(p_spot_ids) <> 9 or (select count(distinct item) from unnest(p_spot_ids) item) <> 9 then
    raise exception 'Nine unique places are required' using errcode = '22023';
  end if;

  select extract(year from age(current_date, date_of_birth))::integer into age_value
  from member_ages where user_id = uid;
  if age_value is null then raise exception 'Complete age details first' using errcode = '42501'; end if;
  required_age := case when category_value in ('nightlife','vibes','beach_club') then 21
    when category_value = 'shisha' then 18 else 0 end;
  if age_value < required_age then raise exception 'Category is not age appropriate' using errcode = '42501'; end if;

  if (select count(*) from spots s where s.id = any(p_spot_ids)
      and (s.source = 'curated' or s.created_by_user_id = uid)
      and s.category = category_value
      and age_value >= greatest(s.minimum_age, case when s.category in ('nightlife','vibes','beach_club') then 21 when s.category='shisha' then 18 else 0 end)) <> 9 then
    raise exception 'One or more places are unavailable' using errcode = '42501';
  end if;

  begin deadline_value := (p_plan->>'deadline')::timestamptz;
  exception when others then raise exception 'Invalid deadline' using errcode = '22023'; end;
  if deadline_value is null or deadline_value <= now() or deadline_value > now() + interval '1 year' then
    raise exception 'Deadline must be in the future' using errcode = '22023';
  end if;

  if jsonb_typeof(p_plan->'budgetPerPerson') = 'number' then budget_value := (p_plan->>'budgetPerPerson')::integer; end if;
  if budget_value is not null and budget_value not between 0 and 10000 then raise exception 'Invalid budget' using errcode = '22023'; end if;
  if jsonb_typeof(p_plan->'radiusKm') = 'number' then radius_value := (p_plan->>'radiusKm')::integer; end if;
  if radius_value is not null and radius_value not between 1 and 500 then raise exception 'Invalid radius' using errcode = '22023'; end if;
  if jsonb_typeof(p_plan->'originLatitude') = 'number' then latitude_value := (p_plan->>'originLatitude')::double precision; end if;
  if jsonb_typeof(p_plan->'originLongitude') = 'number' then longitude_value := (p_plan->>'originLongitude')::double precision; end if;
  if latitude_value is not null and latitude_value not between -90 and 90 then raise exception 'Invalid latitude' using errcode = '22023'; end if;
  if longitude_value is not null and longitude_value not between -180 and 180 then raise exception 'Invalid longitude' using errcode = '22023'; end if;
  if (latitude_value is null) <> (longitude_value is null) then raise exception 'Coordinates must be provided together' using errcode = '22023'; end if;

  if jsonb_typeof(p_plan->'vibePreferences') = 'array' then
    select coalesce(array_agg(clean_app_text(value, 30) order by ord), '{}') into vibe_values
    from jsonb_array_elements_text(p_plan->'vibePreferences') with ordinality item(value, ord) where ord <= 6;
  end if;
  if jsonb_typeof(p_plan->'avoidPreferences') = 'array' then
    select coalesce(array_agg(clean_app_text(value, 30) order by ord), '{}') into avoid_values
    from jsonb_array_elements_text(p_plan->'avoidPreferences') with ordinality item(value, ord) where ord <= 5;
  end if;

  insert into plans(title, category, area, deadline, status, stage, pool_count,
    budget_per_person, origin_label, origin_latitude, origin_longitude, radius_km,
    smart_brief, vibe_preferences, avoid_preferences, intelligence_model, created_by_user_id)
  values(title_value, category_value, nullif(clean_app_text(p_plan->>'area',80),''), deadline_value,
    'open','pool',3,budget_value,nullif(clean_app_text(p_plan->>'originLabel',80),''),
    latitude_value,longitude_value,radius_value,nullif(clean_app_text(p_plan->>'smartBrief',600),''),
    vibe_values,avoid_values,null,uid)
  returning id into plan_id_value;

  host_token_value := encode(gen_random_bytes(32), 'hex');
  insert into plan_host_tokens(plan_id, token_hash)
  values(plan_id_value, encode(digest(host_token_value, 'sha256'), 'hex'));
  insert into plan_spots(plan_id, spot_id, pool_number, advanced)
  select plan_id_value, spot_id, ((ord - 1) % 3 + 1)::smallint, false
  from unnest(p_spot_ids) with ordinality selected(spot_id, ord);
  insert into plan_access(plan_id, user_id) values(plan_id_value, uid);

  return jsonb_build_object('id', plan_id_value, 'hostToken', host_token_value);
end; $$;
revoke all on function create_secure_plan(jsonb, uuid[]) from public;
grant execute on function create_secure_plan(jsonb, uuid[]) to authenticated;

drop policy if exists "create own plans" on plans;
drop policy if exists "update own plans" on plans;
drop policy if exists "attach own plan_spots" on plan_spots;
drop policy if exists "attach host token" on plan_host_tokens;
revoke insert, update, delete on plans, plan_spots, plan_host_tokens from anon, authenticated;
revoke insert, update, delete on votes, rsvps, ratings from anon, authenticated;

-- ── Permanent-account and social privacy boundaries ───────────────

create or replace function is_permanent_user()
returns boolean language sql stable set search_path = pg_catalog as $$
  select auth.uid() is not null and coalesce(auth.jwt()->>'is_anonymous','false') <> 'true'
$$;

drop policy if exists "read own age" on member_ages;
create or replace function current_member_age()
returns integer language sql stable security definer set search_path = public, pg_temp as $$
  select extract(year from age(current_date, date_of_birth))::integer
  from member_ages where user_id = auth.uid() and is_permanent_user()
$$;
revoke all on function current_member_age() from public;
grant execute on function current_member_age() to authenticated;

-- Anonymous guests cannot turn a throwaway identity into a durable profile.
create or replace function ensure_authenticated_profile(
  p_display_name text, p_emoji text default '?', p_color text default '#34363b'
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); profile_id uuid;
begin
  if uid is null or not is_permanent_user() then raise exception 'Permanent account required' using errcode='42501'; end if;
  select id into profile_id from people where auth_user_id = uid;
  if profile_id is not null then return profile_id; end if;
  insert into people(id, display_name, emoji, color, auth_user_id)
  values(uid, coalesce(nullif(clean_app_text(p_display_name,40),''),'Friend'), '?', '#34363b', uid)
  on conflict(auth_user_id) do update set auth_user_id=excluded.auth_user_id returning id into profile_id;
  return profile_id;
end; $$;
revoke all on function ensure_authenticated_profile(text,text,text) from public;
grant execute on function ensure_authenticated_profile(text,text,text) to authenticated;

drop policy if exists "read people" on people;
drop policy if exists "read friendships" on friendships;
drop policy if exists "read visits" on visits;
drop policy if exists "read companions" on visit_companions;
create policy "read permitted people" on people for select to authenticated using (
  is_permanent_user() and (auth_user_id = (select auth.uid()) or exists (
    select 1 from friendships f where f.person_id = (select auth.uid()) and f.friend_id = people.id
  ))
);
create policy "read own friendships" on friendships for select to authenticated using (
  is_permanent_user() and person_id = (select auth.uid())
);
create policy "read permitted visits" on visits for select to authenticated using (
  is_permanent_user() and (person_id = (select auth.uid()) or exists (
    select 1 from friendships f where f.person_id = (select auth.uid()) and f.friend_id = visits.person_id
  ))
);
create policy "read permitted companions" on visit_companions for select to authenticated using (
  is_permanent_user() and exists (select 1 from visits v where v.id = visit_companions.visit_id)
);

drop policy if exists "create own profile" on people;
drop policy if exists "update own profile" on people;
create policy "create own permanent profile" on people for insert to authenticated
  with check (is_permanent_user() and id = (select auth.uid()) and auth_user_id = (select auth.uid()));
create policy "update own permanent profile" on people for update to authenticated
  using (is_permanent_user() and auth_user_id = (select auth.uid()))
  with check (is_permanent_user() and auth_user_id = (select auth.uid()));

drop policy if exists "create custom spots" on spots;
drop policy if exists "update own custom spots" on spots;
drop policy if exists "delete own custom spots" on spots;
create policy "create own custom spots" on spots for insert to authenticated
  with check (is_permanent_user() and source='custom' and created_by_user_id=(select auth.uid()));
create policy "update own custom spots" on spots for update to authenticated
  using (is_permanent_user() and source='custom' and created_by_user_id=(select auth.uid()))
  with check (is_permanent_user() and source='custom' and created_by_user_id=(select auth.uid()));
create policy "delete own custom spots" on spots for delete to authenticated
  using (is_permanent_user() and source='custom' and created_by_user_id=(select auth.uid()));

-- Enforce image restrictions at Storage even before the production uploader
-- is connected.
update storage.buckets set file_size_limit = 8388608,
  allowed_mime_types = array['image/jpeg','image/png','image/webp']
where id = 'visit-photos';

-- ── Durable quotas and minimized security events ──────────────────

create table if not exists app_control_secrets (
  name text primary key,
  secret_hash text not null,
  created_at timestamptz not null default now()
);
alter table app_control_secrets enable row level security;

create table if not exists app_rate_limits (
  scope text not null,
  subject text not null,
  window_start timestamptz not null,
  request_count integer not null default 0 check(request_count >= 0),
  primary key(scope, subject, window_start)
);
alter table app_rate_limits enable row level security;

create table if not exists security_events (
  id bigint generated always as identity primary key,
  event_type text not null,
  outcome text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  subject_hash text,
  request_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists security_events_created_idx on security_events(created_at desc);
alter table security_events enable row level security;

create or replace function valid_control_secret(p_secret text)
returns boolean language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select exists(select 1 from app_control_secrets
    where name='server-control' and secret_hash = crypt(p_secret, secret_hash))
$$;
revoke all on function valid_control_secret(text) from public;

create or replace function consume_app_quota(p_secret text, p_scope text)
returns boolean language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare uid uuid := auth.uid(); minute_start timestamptz := date_trunc('minute',now()); day_start timestamptz := date_trunc('day',now()); current_count integer; minute_limit integer; day_limit integer;
begin
  if not valid_control_secret(p_secret) or uid is null or p_scope not in ('smart-search','plan-create','place-import') then
    raise exception 'Server authorization required' using errcode='42501';
  end if;
  minute_limit := case p_scope when 'smart-search' then 10 when 'plan-create' then 12 else 20 end;
  day_limit := case p_scope when 'smart-search' then 30 when 'plan-create' then 50 else 200 end;
  insert into app_rate_limits values(p_scope||'-minute',uid::text,minute_start,1)
    on conflict(scope,subject,window_start) do update set request_count=app_rate_limits.request_count+1
    returning request_count into current_count;
  if current_count > minute_limit then return false; end if;
  insert into app_rate_limits values(p_scope||'-day',uid::text,day_start,1)
    on conflict(scope,subject,window_start) do update set request_count=app_rate_limits.request_count+1
    returning request_count into current_count;
  if current_count > day_limit then return false; end if;
  if p_scope = 'smart-search' then
    insert into app_rate_limits values('smart-search-global','global',day_start,1)
      on conflict(scope,subject,window_start) do update set request_count=app_rate_limits.request_count+1
      returning request_count into current_count;
    return current_count <= 300;
  end if;
  return true;
end; $$;
revoke all on function consume_app_quota(text,text) from public;
grant execute on function consume_app_quota(text,text) to authenticated;

create or replace function record_security_event(p_secret text, p_event_type text, p_outcome text,
  p_subject_hash text default null, p_request_id text default null, p_metadata jsonb default '{}')
returns void language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if not valid_control_secret(p_secret) then raise exception 'Server authorization required' using errcode='42501'; end if;
  if p_event_type not in ('otp_request','otp_verify','captcha','authorization','rate_limit','plan_command','ai_quota')
     or p_outcome not in ('success','failure','blocked') then raise exception 'Unsupported event' using errcode='22023'; end if;
  if pg_column_size(coalesce(p_metadata,'{}')) > 2048 then raise exception 'Metadata too large' using errcode='22023'; end if;
  insert into security_events(event_type,outcome,actor_user_id,subject_hash,request_id,metadata)
  values(p_event_type,p_outcome,auth.uid(),left(p_subject_hash,128),left(p_request_id,128),coalesce(p_metadata,'{}'));
end; $$;
revoke all on function record_security_event(text,text,text,text,text,jsonb) from public;
grant execute on function record_security_event(text,text,text,text,text,jsonb) to anon, authenticated;

-- Private Presence channel: topic is plan:<uuid>:presence.
drop policy if exists "plan members receive presence" on realtime.messages;
drop policy if exists "plan members send presence" on realtime.messages;
create policy "plan members receive presence" on realtime.messages for select to authenticated using (
  realtime.messages.extension = 'presence'
  and (select realtime.topic()) ~ '^plan:[0-9a-f-]{36}:presence$'
  and exists(select 1 from plan_access a where a.user_id=(select auth.uid())
    and a.plan_id=split_part((select realtime.topic()),':',2)::uuid)
);
create policy "plan members send presence" on realtime.messages for insert to authenticated with check (
  realtime.messages.extension = 'presence'
  and (select realtime.topic()) ~ '^plan:[0-9a-f-]{36}:presence$'
  and exists(select 1 from plan_access a where a.user_id=(select auth.uid())
    and a.plan_id=split_part((select realtime.topic()),':',2)::uuid)
);

-- Keep only recent operational data. Run daily through Supabase Cron.
create or replace function purge_security_operational_data()
returns void language sql security definer set search_path = public, pg_temp as $$
  delete from security_events where created_at < now() - interval '90 days';
  delete from app_rate_limits where window_start < now() - interval '2 days';
$$;
revoke all on function purge_security_operational_data() from public, anon, authenticated;
