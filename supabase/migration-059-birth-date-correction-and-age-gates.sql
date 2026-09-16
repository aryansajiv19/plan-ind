-- Migration 059 — fix a wrong birthday (C4), and ONE source for age gates.
-- Apply after 058. Re-run safe. STAGED.
--
-- ── Age gates: one list ──────────────────────────────────────────────────
-- The 18/21 thresholds were hardcoded as CASE expressions in three places in
-- create_secure_plan/create_direct_plan. category_age_gates() is now the one
-- list; category_min_age() and spot_required_age() read it, the creation
-- functions call them (behaviour-identical, rig-proven), and
-- correct_birth_date derives the highest gate from the same list. A function,
-- not a table: the values change only by migration, so a table would add RLS,
-- seed data and a client-readable surface for nothing. If gates ever need to
-- change without a migration, this body becomes a table read and no caller
-- changes. (lib/age-policy.ts is a UI copy; the server is authoritative.)
--
-- ── correct_birth_date ────────────────────────────────────────────────────
-- set_birth_date stays write-once. This allows ONE correction per account
-- (member_ages.corrected_at), with a DIRECTION rule:
--   younger (a later date)  -> allowed (never unlocks anything), still >= 13
--   older   (an earlier date) -> allowed only if the person is ALREADY past the
--       highest gate under their current date, so no gate can move earlier.
--       Otherwise crosses_age_gate: the client says "contact support" (a
--       manual, human-judged fix outside the app).
-- A same-band rule was rejected: 17.0 -> 17.99 stays under 18 today and
-- unlocks 18 tomorrow.
-- Highest gate = greatest(max over category_age_gates(), max minimum_age of
-- CURATED spots). Curated only: a user's own custom spot must not raise the bar
-- for everyone (live max when written: 21, values 0/18/21).
-- Audit: one security_events row per correction AND per refused crossing, with
-- direction and gate counts only, never dates.
--
-- Time zone: ages are computed on Dubai's date. These functions pin
-- `set timezone = 'Asia/Dubai'`: without it current_date follows the session,
-- which a PostgREST caller can set per request (`Prefer: timezone=…`), moving
-- "today" by up to a day and letting a gate open early (verified on the rig).
-- set_birth_date and current_member_age have the same pre-existing issue; noted
-- for a follow-up, not widened here.

create or replace function category_age_gates()
returns table (category text, minimum_age smallint)
language sql immutable set search_path = pg_catalog as $$
  values ('shisha'::text, 18::smallint), ('nightlife', 21), ('vibes', 21), ('beach_club', 21)
$$;

create or replace function category_min_age(p_category text)
returns smallint
language sql immutable set search_path = public, pg_temp as $$
  select coalesce((select g.minimum_age from category_age_gates() g where g.category = p_category), 0::smallint)
$$;

create or replace function spot_required_age(p_category text, p_spot_minimum_age smallint)
returns integer
language sql immutable set search_path = public, pg_temp as $$
  select greatest(coalesce(p_spot_minimum_age, 0), category_min_age(p_category))::integer
$$;

-- Only the definer functions below call these.
revoke all on function category_age_gates() from public, anon, authenticated;
revoke all on function category_min_age(text) from public, anon, authenticated;
revoke all on function spot_required_age(text, smallint) from public, anon, authenticated;

alter table member_ages add column if not exists corrected_at timestamptz;

create or replace function correct_birth_date(p_date_of_birth date)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set timezone = 'Asia/Dubai'
as $$
declare
  uid uuid := auth.uid();
  current_dob date;
  already timestamptz;
  current_age integer;
  new_age integer;
  highest_gate integer;
  gates_from integer;
  gates_to integer;
begin
  if uid is null or not is_permanent_user() then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  select date_of_birth, corrected_at into current_dob, already
  from member_ages where user_id = uid for update;
  if current_dob is null then
    return jsonb_build_object('result', 'not_on_file');
  end if;
  if already is not null then
    return jsonb_build_object('result', 'already_corrected');
  end if;
  if p_date_of_birth is null or p_date_of_birth > current_date then
    return jsonb_build_object('result', 'invalid_date');
  end if;
  new_age := extract(year from age(current_date, p_date_of_birth));
  if new_age < 13 or new_age > 120 then
    return jsonb_build_object('result', 'invalid_date');
  end if;
  if p_date_of_birth = current_dob then
    return jsonb_build_object('result', 'no_change');
  end if;

  current_age := extract(year from age(current_date, current_dob));
  if p_date_of_birth < current_dob then
    highest_gate := greatest(
      (select max(g.minimum_age) from category_age_gates() g),
      coalesce((select max(s.minimum_age) from spots s where s.source = 'curated'), 0));
    if current_age < highest_gate then
      -- The refused attempt is the one this function defends against: log it.
      insert into security_events (event_type, outcome, actor_user_id, metadata)
      values ('authorization', 'blocked', uid,
        jsonb_build_object('command', 'correct_birth_date', 'direction', 'older', 'result', 'crosses_age_gate'));
      return jsonb_build_object('result', 'crosses_age_gate');
    end if;
  end if;

  update member_ages set date_of_birth = p_date_of_birth, corrected_at = now() where user_id = uid;

  select count(distinct g.minimum_age) filter (where g.minimum_age <= current_age),
         count(distinct g.minimum_age) filter (where g.minimum_age <= new_age)
  into gates_from, gates_to from category_age_gates() g;
  insert into security_events (event_type, outcome, actor_user_id, metadata)
  values ('authorization', 'success', uid, jsonb_build_object(
    'command', 'correct_birth_date',
    'direction', case when p_date_of_birth < current_dob then 'older' else 'younger' end,
    'gates_passed_from', gates_from, 'gates_passed_to', gates_to));

  return jsonb_build_object('result', 'corrected');
end;
$$;

revoke all on function correct_birth_date(date) from public, anon, authenticated;
grant execute on function correct_birth_date(date) to authenticated;

-- Creation functions: the three CASE copies replaced by the helpers above.
-- Bodies are 058's otherwise verbatim; create or replace keeps the grants.
create or replace function create_secure_plan(p_plan jsonb, p_spot_ids uuid[])
returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp set timezone = 'Asia/Dubai' as $$
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
  if title_value = '' or clean_display_name(title_value) = '' or category_value = '' then
    raise exception 'A title and category are required' using errcode = '22023';
  end if;
  if cardinality(p_spot_ids) <> 9 or (select count(distinct item) from unnest(p_spot_ids) item) <> 9 then
    raise exception 'Nine unique places are required' using errcode = '22023';
  end if;

  select extract(year from age(current_date, date_of_birth))::integer into age_value
  from member_ages where user_id = uid;
  if age_value is null then raise exception 'Complete age details first' using errcode = '42501'; end if;
  required_age := category_min_age(category_value);
  if age_value < required_age then raise exception 'Category is not age appropriate' using errcode = '42501'; end if;

  -- 033: no clause requiring s.category = category_value -- no curated
  -- category has 9 spots on its own (dinner, the largest, has 5), so
  -- /api/spots/deal deals from the whole category family by design
  -- (categoryFamily() in lib/spots/match.ts) and a plan's 9 spots routinely
  -- span several categories. The strict match blocked every plan creation.
  if (select count(*) from spots s where s.id = any(p_spot_ids)
      and (s.source = 'curated' or s.created_by_user_id = uid)
      and age_value >= spot_required_age(s.category, s.minimum_age)) <> 9 then
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

create or replace function create_direct_plan(p_plan jsonb, p_spot_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp set timezone = 'Asia/Dubai' as $$
declare
  uid uuid := auth.uid();
  title_value text := clean_app_text(p_plan->>'title', 60);
  category_value text;
  deadline_value timestamptz;
  age_value integer;
  spot_min_age integer;
  spot_category_required_age integer;
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
     or (p_plan - array['title','area','deadline','budgetPerPerson','originLabel','originLatitude','originLongitude','radiusKm','smartBrief','vibePreferences','avoidPreferences']) <> '{}'::jsonb then
    raise exception 'Unsupported plan fields' using errcode = '22023';
  end if;
  if title_value = '' or clean_display_name(title_value) = '' or p_spot_id is null then
    raise exception 'A title and a place are required' using errcode = '22023';
  end if;

  select extract(year from age(current_date, date_of_birth))::integer into age_value
  from member_ages where user_id = uid;
  if age_value is null then raise exception 'Complete age details first' using errcode = '42501'; end if;

  select s.category, s.minimum_age, category_min_age(s.category)
  into category_value, spot_min_age, spot_category_required_age
  from spots s
  where s.id = p_spot_id and (s.source = 'curated' or s.created_by_user_id = uid);
  if category_value is null then
    raise exception 'That place is unavailable' using errcode = '42501';
  end if;
  if age_value < greatest(spot_min_age, spot_category_required_age) then
    raise exception 'That place is not age appropriate' using errcode = '42501';
  end if;

  begin deadline_value := nullif(p_plan->>'deadline', '')::timestamptz;
  exception when others then deadline_value := null; end;

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
    smart_brief, vibe_preferences, avoid_preferences, intelligence_model, created_by_user_id,
    winner_spot_id)
  values(title_value, category_value, nullif(clean_app_text(p_plan->>'area',80),''), deadline_value,
    'decided','decided',1,budget_value,nullif(clean_app_text(p_plan->>'originLabel',80),''),
    latitude_value,longitude_value,radius_value,nullif(clean_app_text(p_plan->>'smartBrief',600),''),
    vibe_values,avoid_values,null,uid,
    p_spot_id)
  returning id into plan_id_value;

  host_token_value := encode(gen_random_bytes(32), 'hex');
  insert into plan_host_tokens(plan_id, token_hash)
  values(plan_id_value, encode(digest(host_token_value, 'sha256'), 'hex'));
  insert into plan_spots(plan_id, spot_id, pool_number, advanced)
  values(plan_id_value, p_spot_id, 1, true);
  insert into plan_access(plan_id, user_id) values(plan_id_value, uid);

  return jsonb_build_object('id', plan_id_value, 'hostToken', host_token_value);
end; $$;
