-- Migration 058 — plan creation refuses invisible-only titles. Apply after 057
-- (needs 052's clean_display_name). Re-run safe. STAGED. Severity: Low (only the
-- creator's own plan title; confusing, not a breach).
--
-- create_secure_plan and create_direct_plan cleaned titles with clean_app_text,
-- which keeps zero-width characters, so a title of only U+200B (or U+200B+ZWJ)
-- was stored as an invisible title. Probed on a live-identical rig with a
-- positive control; 055's edit_plan already refuses it. Same rule here: the
-- title must also be non-empty under clean_display_name (the one invisible-
-- character set; ZWJ/ZWNJ inside words are kept, so Persian titles still work).
-- The stored title is unchanged (clean_app_text, 60 chars).
--
-- The ONLY change in each function is its title condition; the rest is the
-- live body verbatim. It raises the same 'A title … required' 22023 error the
-- client already handles for an empty title. `create or replace` with the same
-- signatures keeps the existing grants.

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
  if title_value = '' or clean_display_name(title_value) = '' or category_value = '' then
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

  -- 033: no clause requiring s.category = category_value -- no curated
  -- category has 9 spots on its own (dinner, the largest, has 5), so
  -- /api/spots/deal deals from the whole category family by design
  -- (categoryFamily() in lib/spots/match.ts) and a plan's 9 spots routinely
  -- span several categories. The strict match blocked every plan creation.
  if (select count(*) from spots s where s.id = any(p_spot_ids)
      and (s.source = 'curated' or s.created_by_user_id = uid)
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

create or replace function create_direct_plan(p_plan jsonb, p_spot_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
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

  select s.category, s.minimum_age,
    case when s.category in ('nightlife','vibes','beach_club') then 21
         when s.category = 'shisha' then 18 else 0 end
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
