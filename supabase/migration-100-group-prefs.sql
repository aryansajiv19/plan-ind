-- Migration 100: group preferences (docs/GROUP_PREFS.md, "Schema").
--
-- STAGED -- written, not applied anywhere. Apply only with the owner's
-- approval (after the security review), then record it in worklog.md the same day.
-- ADDITIVE and re-run safe. Nothing is dropped except the plans.stage CHECK,
-- which is replaced by the same list plus 'gathering'.
--
-- A host shares a link first ('gathering', no places yet); each member answers
-- three taps; the host deals nine places that fit everyone and the plan moves
-- on to 'pool', where voting is exactly as before.
--
--  * plans.stage gains 'gathering'. plans.group_summary jsonb (what the deal
--    used) is added AND granted to authenticated (051: a new plans column is
--    invisible to clients until granted).
--  * plan_preferences: one row per (plan, account). Members of the plan can
--    SELECT their plan's rows (same plan_access rule as votes). NO insert,
--    update or delete policy and no write grant: rows are written only by
--    set_plan_preferences. Added to supabase_realtime (a member sees only
--    their plans' rows: Realtime applies the SELECT policy).
--  * RPCs, all security definer, set search_path, revoked from public/anon/
--    authenticated and granted to authenticated only:
--      create_gathering_plan   permanent (non-anonymous) account only.
--      set_plan_preferences    any plan MEMBER (auth.uid() + plan_access only,
--                              so a future guest session works unchanged).
--      start_group_plan        the plan's creator (permanent account) only.
--  * A trigger on plan_access removes a leaving/removed member's answers, so
--    a gone friend never shapes the deal (leave_plan/remove_plan_member
--    untouched).
--
-- Guest lane: set_plan_preferences needs no change for guests. It reads the
-- name from people.display_name and falls back to 'Guest' when the session has
-- no people row. The policy below deliberately omits is_permanent_user() so a
-- member guest can read the answers; if the guest lane wants answers hidden
-- from guests, add `(select is_permanent_user()) and` to that one policy.

begin;

-- ── plans: stage + group_summary ───────────────────────────────────────────
alter table plans drop constraint if exists plans_stage_check;
alter table plans add constraint plans_stage_check
  check (stage in ('gathering', 'pool', 'final', 'decided'));
alter table plans add column if not exists group_summary jsonb;
grant select (group_summary) on plans to authenticated;

-- ── plan_preferences ───────────────────────────────────────────────────────
create table if not exists plan_preferences (
  plan_id          uuid not null references plans(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  voter_name       text not null,
  budget_cap       int check (budget_cap is null or budget_cap between 0 and 10000),
  origin_value     text,
  origin_latitude  double precision,
  origin_longitude double precision,
  vibes            text[] not null default '{}' check (cardinality(vibes) <= 2),
  avoid            text[] not null default '{}' check (cardinality(avoid) <= 2),
  updated_at       timestamptz not null default now(),
  primary key (plan_id, user_id)
);

alter table plan_preferences enable row level security;
revoke all on table plan_preferences from public, anon, authenticated;
grant select on plan_preferences to authenticated;
-- Who can do what: a member of the plan can READ every row of that plan.
-- Nobody can write directly; only set_plan_preferences does.
drop policy if exists "read accessible plan preferences" on plan_preferences;
create policy "read accessible plan preferences" on plan_preferences for select to authenticated using (
  exists (select 1 from plan_access a
          where a.plan_id = plan_preferences.plan_id and a.user_id = (select auth.uid()))
);

do $$ begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'plan_preferences') then
    alter publication supabase_realtime add table plan_preferences;
  end if;
end $$;

-- A member who leaves or is removed takes their answers with them.
create or replace function drop_plan_preferences_of_leaver() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from plan_preferences where plan_id = old.plan_id and user_id = old.user_id;
  return old;
end $$;
revoke all on function drop_plan_preferences_of_leaver() from public, anon, authenticated;
drop trigger if exists plan_access_drop_preferences on plan_access;
create trigger plan_access_drop_preferences after delete on plan_access
  for each row execute function drop_plan_preferences_of_leaver();

-- The allowed "coming from" list, server-side so coordinates never come from
-- a request. MUST match DUBAI_ORIGINS in lib/dubai-areas.ts (a dbtest checks).
create or replace function gathering_origins()
returns table (value text, latitude double precision, longitude double precision)
language sql immutable set search_path = public, pg_temp as $$
  select * from (values
    ('anywhere'::text, null::double precision, null::double precision),
    ('downtown', 25.2048, 55.2708), ('marina', 25.0805, 55.1403),
    ('jumeirah', 25.204, 55.238), ('al-quoz', 25.1345, 55.2346),
    ('creek', 25.244, 55.331), ('business-bay', 25.185, 55.265),
    ('deira', 25.27, 55.315), ('jvc', 25.06, 55.21), ('mirdif', 25.22, 55.42),
    ('dso', 25.12, 55.38), ('sharjah', 25.346, 55.42)
  ) o(value, latitude, longitude)
$$;
revoke all on function gathering_origins() from public, anon, authenticated;

-- ── create_gathering_plan ──────────────────────────────────────────────────
-- Body keys: title, category, optional deadline (default 24h out). No places.
-- The 087 cap trigger on plans counts this insert like any other plan.
create or replace function create_gathering_plan(p_plan jsonb)
returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp set timezone = 'Asia/Dubai' as $$
declare
  uid uuid := auth.uid();
  title_value text := clean_app_text(p_plan->>'title', 60);
  category_value text := clean_app_text(p_plan->>'category', 40);
  deadline_value timestamptz := now() + interval '24 hours';
  age_value integer;
  plan_id_value uuid;
  host_token_value text;
begin
  if uid is null or coalesce(auth.jwt()->>'is_anonymous', 'false') = 'true' then
    raise exception 'A permanent account is required' using errcode = '42501';
  end if;
  if p_plan is null or jsonb_typeof(p_plan) <> 'object'
     or (p_plan - array['title','category','deadline']) <> '{}'::jsonb then
    raise exception 'Unsupported plan fields' using errcode = '22023';
  end if;
  if title_value = '' or clean_display_name(title_value) = '' or category_value = '' then
    raise exception 'A title and category are required' using errcode = '22023';
  end if;
  select extract(year from age(current_date, date_of_birth))::integer into age_value
  from member_ages where user_id = uid;
  if age_value is null then raise exception 'Complete age details first' using errcode = '42501'; end if;
  if age_value < category_min_age(category_value) then
    raise exception 'Category is not age appropriate' using errcode = '42501';
  end if;
  if p_plan ? 'deadline' then
    begin deadline_value := (p_plan->>'deadline')::timestamptz;
    exception when others then raise exception 'Invalid deadline' using errcode = '22023'; end;
    if deadline_value is null or deadline_value <= now() or deadline_value > now() + interval '1 year' then
      raise exception 'Deadline must be in the future' using errcode = '22023';
    end if;
  end if;

  insert into plans(title, category, deadline, status, stage, pool_count, created_by_user_id)
  values(title_value, category_value, deadline_value, 'open', 'gathering', 3, uid)
  returning id into plan_id_value;

  host_token_value := encode(gen_random_bytes(32), 'hex');
  insert into plan_host_tokens(plan_id, token_hash)
  values(plan_id_value, encode(digest(host_token_value, 'sha256'), 'hex'));
  insert into plan_access(plan_id, user_id) values(plan_id_value, uid);

  return jsonb_build_object('id', plan_id_value, 'hostToken', host_token_value);
end; $$;
revoke all on function create_gathering_plan(jsonb) from public, anon, authenticated;
grant execute on function create_gathering_plan(jsonb) to authenticated;

-- ── set_plan_preferences ───────────────────────────────────────────────────
-- Any member of a 'gathering' plan upserts THEIR OWN row. Returns
-- {result:'saved'} or {result:'not_gathering'} (the plan moved on or is gone
-- from under you: a clean no-op, nothing written). Raises 42501 for a
-- non-member, 22023 for bad input (budget outside 0..10000, an origin not in
-- gathering_origins(), more than 2 vibes/avoids, vibes outside the 8 allowed, avoids outside the 3 allowed).
-- Idempotent: the same call twice leaves the same row.
create or replace function set_plan_preferences(
  p_plan_id uuid, p_budget_cap int, p_origin_value text, p_vibes text[], p_avoid text[]
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  target plans%rowtype;
  name_value text;
  org_lat double precision;
  org_lng double precision;
  vibe_values text[] := '{}';
  avoid_values text[] := '{}';
begin
  if uid is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  -- Take the plan row first (as 080 does) so a deal or a removal in flight
  -- finishes before we look at stage and membership.
  select * into target from plans where id = p_plan_id for key share;
  if target.id is null or not exists (
    select 1 from plan_access where plan_id = p_plan_id and user_id = uid
  ) then
    raise exception 'Plan access required' using errcode = '42501';
  end if;

  if p_budget_cap is not null and p_budget_cap not between 0 and 10000 then
    raise exception 'Invalid budget' using errcode = '22023';
  end if;
  if p_origin_value is not null then
    select o.latitude, o.longitude into org_lat, org_lng from gathering_origins() o where o.value = p_origin_value;
    if not found then raise exception 'Unknown starting point' using errcode = '22023'; end if;
  end if;
  if coalesce(cardinality(p_vibes), 0) > 2 or coalesce(cardinality(p_avoid), 0) > 2 then
    raise exception 'At most two of each' using errcode = '22023';
  end if;
  -- Closed vocabularies (owner decision 2026-10-01); duplicates refused.
  if p_vibes is not null then
    if not (p_vibes <@ array['chill','lively','romantic','rooftop','waterfront','quiet','outdoor','upscale'])
       or (select count(distinct v) from unnest(p_vibes) v) <> cardinality(p_vibes) then
      raise exception 'Invalid vibe' using errcode = '22023';
    end if;
    vibe_values := p_vibes;
  end if;
  if p_avoid is not null then
    if not (p_avoid <@ array['loud','shisha','alcohol'])
       or (select count(distinct v) from unnest(p_avoid) v) <> cardinality(p_avoid) then
      raise exception 'Invalid avoid item' using errcode = '22023';
    end if;
    avoid_values := p_avoid;
  end if;

  if target.stage <> 'gathering' or target.status <> 'open' then
    return jsonb_build_object('result', 'not_gathering');
  end if;

  -- The name is the account's own profile name, never the request.
  name_value := coalesce(
    nullif(clean_display_name((select pe.display_name from people pe where pe.auth_user_id = uid)), ''),
    'Guest');

  insert into plan_preferences as pp (plan_id, user_id, voter_name, budget_cap, origin_value,
    origin_latitude, origin_longitude, vibes, avoid, updated_at)
  values (p_plan_id, uid, name_value, p_budget_cap, p_origin_value,
    org_lat, org_lng, vibe_values, avoid_values, now())
  on conflict (plan_id, user_id) do update set
    voter_name = excluded.voter_name, budget_cap = excluded.budget_cap,
    origin_value = excluded.origin_value, origin_latitude = excluded.origin_latitude,
    origin_longitude = excluded.origin_longitude, vibes = excluded.vibes,
    avoid = excluded.avoid, updated_at = now();
  return jsonb_build_object('result', 'saved');
end; $$;
revoke all on function set_plan_preferences(uuid, int, text, text[], text[]) from public, anon, authenticated;
grant execute on function set_plan_preferences(uuid, int, text, text[], text[]) to authenticated;

-- ── start_group_plan ───────────────────────────────────────────────────────
-- Host only (plan creator, permanent account). p_group keys, all optional:
--   budgetCap (int 0..10000)     -> plans.budget_per_person
--   centroid {latitude,longitude} -> plans.origin_* (label 'Fair point for the group')
--   radiusKm (int 1..500)        -> plans.radius_km
--   relaxed  (array of 'budget'/'distance')
-- group_summary is rebuilt from those plus `answered`, which the SERVER counts
-- from plan_preferences (a caller cannot claim more answers than exist).
-- Returns {result:'dealt'} or {result:'not_gathering'} (second call: clean
-- no-op, no second set of plan_spots). Raises 42501 for non-host, 22023 for
-- bad input. The nine places face the same checks as create_secure_plan
-- (closed, age, curated-or-yours). If the deadline is under an hour away it is
-- moved to 24h out, so a long-lived gathering link doesn't deal into an
-- already-expired round.
create or replace function start_group_plan(p_plan_id uuid, p_spot_ids uuid[], p_group jsonb)
returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp set timezone = 'Asia/Dubai' as $$
declare
  uid uuid := auth.uid();
  target plans%rowtype;
  age_value integer;
  budget_value integer;
  radius_value integer;
  lat_value double precision;
  lng_value double precision;
  relaxed_values jsonb := '[]'::jsonb;
  answered_value integer;
  summary jsonb;
begin
  if uid is null or not is_permanent_user() then
    raise exception 'A permanent account is required' using errcode = '42501';
  end if;
  select * into target from plans where id = p_plan_id for update;
  if target.id is null or target.created_by_user_id is distinct from uid then
    raise exception 'Only the host can deal' using errcode = '42501';
  end if;

  p_group := coalesce(p_group, '{}'::jsonb);
  if jsonb_typeof(p_group) <> 'object'
     or (p_group - array['budgetCap','centroid','radiusKm','relaxed']) <> '{}'::jsonb then
    raise exception 'Unsupported group fields' using errcode = '22023';
  end if;
  if jsonb_typeof(p_group->'budgetCap') = 'number' then budget_value := (p_group->>'budgetCap')::integer; end if;
  if budget_value is not null and budget_value not between 0 and 10000 then
    raise exception 'Invalid budget' using errcode = '22023';
  end if;
  if jsonb_typeof(p_group->'radiusKm') = 'number' then radius_value := (p_group->>'radiusKm')::integer; end if;
  if radius_value is not null and radius_value not between 1 and 500 then
    raise exception 'Invalid radius' using errcode = '22023';
  end if;
  if jsonb_typeof(p_group->'centroid') = 'object' then
    if jsonb_typeof(p_group->'centroid'->'latitude') = 'number' then lat_value := (p_group->'centroid'->>'latitude')::double precision; end if;
    if jsonb_typeof(p_group->'centroid'->'longitude') = 'number' then lng_value := (p_group->'centroid'->>'longitude')::double precision; end if;
    if lat_value is null or lng_value is null or lat_value not between -90 and 90 or lng_value not between -180 and 180 then
      raise exception 'Invalid centroid' using errcode = '22023';
    end if;
  end if;
  if jsonb_typeof(p_group->'relaxed') = 'array' then
    if exists (select 1 from jsonb_array_elements(p_group->'relaxed') r
               where jsonb_typeof(r) <> 'string' or r #>> '{}' not in ('budget','distance'))
       or jsonb_array_length(p_group->'relaxed') > 2 then
      raise exception 'Invalid relaxation' using errcode = '22023';
    end if;
    relaxed_values := p_group->'relaxed';
  end if;

  if p_spot_ids is null or cardinality(p_spot_ids) <> 9
     or (select count(distinct item) from unnest(p_spot_ids) item) <> 9 then
    raise exception 'Nine unique places are required' using errcode = '22023';
  end if;

  -- Stage guard AFTER input validation, under the row lock: a second call
  -- finds 'pool' and does nothing.
  if target.stage <> 'gathering' or target.status <> 'open' then
    return jsonb_build_object('result', 'not_gathering');
  end if;

  select extract(year from age(current_date, date_of_birth))::integer into age_value
  from member_ages where user_id = uid;
  if age_value is null then raise exception 'Complete age details first' using errcode = '42501'; end if;
  if age_value < category_min_age(target.category) then
    raise exception 'Category is not age appropriate' using errcode = '42501';
  end if;
  if exists (select 1 from spots s where s.id = any(p_spot_ids)
             and s.source = 'curated' and (s.visibility = 'private' or s.reopens_on > (now() at time zone 'Asia/Dubai')::date)) then
    raise exception 'One of these places is closed right now. Deal again to replace it.' using errcode = '22023';
  end if;
  if (select count(*) from spots s where s.id = any(p_spot_ids)
      and (s.source = 'curated' or s.created_by_user_id = uid)
      and age_value >= spot_required_age(s.category, s.minimum_age)) <> 9 then
    raise exception 'One or more places are unavailable' using errcode = '42501';
  end if;

  select count(*) into answered_value from plan_preferences where plan_id = p_plan_id;
  summary := jsonb_build_object('answered', answered_value, 'budgetCap', budget_value,
    'centroid', case when lat_value is null then null
                     else jsonb_build_object('latitude', lat_value, 'longitude', lng_value) end,
    'radiusKm', radius_value, 'relaxed', relaxed_values);

  insert into plan_spots(plan_id, spot_id, pool_number, advanced)
  select p_plan_id, spot_id, ((ord - 1) % 3 + 1)::smallint, false
  from unnest(p_spot_ids) with ordinality selected(spot_id, ord);

  update plans set
    stage = 'pool',
    budget_per_person = budget_value,
    origin_label = case when lat_value is null then origin_label else 'Fair point for the group' end,
    origin_latitude = coalesce(lat_value, origin_latitude),
    origin_longitude = coalesce(lng_value, origin_longitude),
    radius_km = coalesce(radius_value, radius_km),
    group_summary = summary,
    deadline = case when deadline is null or deadline < now() + interval '1 hour'
                    then now() + interval '24 hours' else deadline end
  where id = p_plan_id;

  return jsonb_build_object('result', 'dealt');
end; $$;
revoke all on function start_group_plan(uuid, uuid[], jsonb) from public, anon, authenticated;
grant execute on function start_group_plan(uuid, uuid[], jsonb) to authenticated;

commit;
