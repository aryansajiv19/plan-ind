-- Migration 033 — fix create_secure_plan's category check, which currently
-- blocks EVERY plan creation through the normal deal-then-create flow.
-- Apply after migration 032. Re-run safe (create or replace only).
--
-- SEVERITY: this is the core "start a plan" loop, broken for every
-- category, live in production right now, since migration 020
-- (2026-08-24) introduced this check.
--
-- ROOT CAUSE, confirmed end to end against a real local mirror of the live
-- catalog (curated spots copied from the live project, not synthetic data):
-- `create_secure_plan` requires all 9 submitted spot ids to have
-- `category = category_value` (the single category the plan was created
-- with). But no curated category has 9 spots on its own -- dinner, the
-- largest, has 5 (this fact is already documented in
-- lib/spots/match.ts:11's comment). `/api/spots/deal` -> `dealSpotIds`
-- therefore deals from a whole CATEGORY FAMILY (categoryFamily() in
-- lib/spots/match.ts, e.g. dinner+cafe+brunch+dessert+shisha), by design,
-- to be able to fill 9 slots at all. The client then submits the plan with
-- `category: "dinner"` (the family member the user actually picked) but
-- spotIds spanning several categories in that family -- exactly as
-- intended by the deal system.
--
-- create_secure_plan's exact-category-match check has zero real spots that
-- can ever satisfy it once family-crossing happens, which is unconditional
-- for every category at the catalog's current size. Reproduced directly: a
-- real POST /api/spots/deal?category=dinner returned
-- [dinner,cafe,cafe,cafe,cafe,brunch,brunch,dessert,dessert] -- 1 of 9
-- actually "dinner" -- and the resulting POST /api/plans 403'd with "This
-- account cannot create that plan." every time.
--
-- FIX: drop the category-equality clause. This does not weaken safety --
-- the age gate right below it already computes each spot's own required
-- age from that spot's own category (`s.category`), independent of
-- category_value, so cross-category spots are still correctly age-gated.
-- The ownership/sourcing clause (`s.source = 'curated' or
-- s.created_by_user_id = uid`) is untouched -- a client still cannot smuggle
-- in another user's private spot or an invented id. What's removed is only
-- the incorrect assumption that every spot in a plan shares the plan's
-- single category, which the deal system was never designed to guarantee.
--
-- Everything else in the function body is byte-identical to migration 020's
-- definition -- this is a one-clause diff, not a rewrite.

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

  -- 033: dropped `and s.category = category_value` -- see this migration's
  -- header. Every other clause (sourcing/ownership, per-spot age gate) is
  -- unchanged.
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

-- `create or replace function` preserves the ACL, but restate it explicitly
-- anyway -- the standing rule in this directory after 021/024 both had to
-- clean up a case where that assumption was wrong.
revoke all on function create_secure_plan(jsonb, uuid[]) from public, anon;
grant execute on function create_secure_plan(jsonb, uuid[]) to authenticated;
