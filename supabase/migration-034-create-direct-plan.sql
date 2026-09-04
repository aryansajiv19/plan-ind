-- Migration 034 — create_direct_plan: skip the vote.
-- Apply after migration 033. Additive (new function only), re-run safe.
--
-- PRIORITIES.md / design-system/SPECS.md §10: a second entry point for
-- someone who already knows the place and wants to lock it in immediately,
-- instead of deal-and-vote through three rounds. Feasibility already
-- checked against create_secure_plan (see worklog.md): the `plans` table
-- itself needs no schema change (pool_count's check already allows 1,
-- stage/status already allow 'decided', winner_spot_id is a plain nullable
-- FK) -- but create_secure_plan's INSERT hardcodes status='open',
-- stage='pool', pool_count=3 unconditionally and requires exactly 9 spot
-- ids, so it cannot serve this case. This is a new, parallel function, not
-- a branch inside that one -- their invariants (nine unresolved candidates
-- vs. one immediately-decided winner) are different enough that sharing one
-- function body would mean threading a mode flag through every check.
--
-- Mirrors create_secure_plan's auth/age/ownership checks exactly (same
-- permanent-account gate, same field whitelist shape, same per-spot age
-- gate, same ownership/sourcing clause). Deliberate differences:
--   - One spot id, not nine -- p_spot_id uuid, not p_spot_ids uuid[].
--   - No `category` input. The picked spot's own category is the only
--     honest source for it (this is exactly the class of bug 033 just
--     fixed for the deal flow -- never trust a client-declared category
--     against real spot data when the real data is authoritative and
--     unambiguous here, since there's exactly one spot).
--   - No deadline requirement. A directly-decided plan has no vote to
--     close, so `deadline` is optional and unvalidated (nullable column,
--     no future-date check) rather than required.
--   - status/stage/pool_count hardcoded to 'decided'/'decided'/1;
--     winner_spot_id set at creation; the one plan_spots row is inserted
--     with advanced = true (it's the finalist, definitionally).
--
-- Downstream compatibility, already confirmed (worklog.md): the plan page's
-- decided-view gate is `status === 'decided'` + `winner_spot_id`, nothing
-- about vote history; DecidedPlan.tsx never references votes/tally itself;
-- execute_plan_command's 'patch' command (event_time/booking_owner/booked)
-- has no stage/status precondition. A plan created directly by this
-- function renders and behaves like a voted-through one from the moment
-- it exists.

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
  if title_value = '' or p_spot_id is null then
    raise exception 'A title and a place are required' using errcode = '22023';
  end if;

  select extract(year from age(current_date, date_of_birth))::integer into age_value
  from member_ages where user_id = uid;
  if age_value is null then raise exception 'Complete age details first' using errcode = '42501'; end if;

  -- The spot's own category is the only source of truth for both the
  -- plan's category label and the age gate -- there is exactly one spot,
  -- so there is no family/mismatch concept to reconcile (unlike
  -- create_secure_plan's nine, see 033).
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

  -- Optional, unvalidated: a directly-decided plan has no vote to close,
  -- so there's nothing for a deadline to gate. Malformed input is treated
  -- as absent rather than rejected.
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

revoke all on function create_direct_plan(jsonb, uuid) from public, anon;
grant execute on function create_direct_plan(jsonb, uuid) to authenticated;
