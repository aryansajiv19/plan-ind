-- Migration 050 — owner-only reads that do not need the uid column.
-- Apply after migration 049. Additive and harmless on its own. Re-run safe.
--
-- Step 1 of 3 for hiding created_by_user_id on spots and plans:
--   050 (this)  → T2 swaps the client reads onto these functions and
--                 app/plan/[id]/page.tsx's plans select("*") for a column list
--               → 051 (the column grants)
--
-- Two client reads filter on created_by_user_id, and a WHERE on a column
-- needs SELECT on it, so they would break under 051:
--   components/StartPlanForm.tsx  "my saved custom places"
--   lib/social.ts                 Wrapped's "plans I hosted this month" count
-- A PostgREST computed field (is_mine(spots)) was tried first and does NOT
-- work: a whole-row reference needs SELECT on every column, so it is refused
-- the moment one column is withheld. Hence two small RPCs.
--
-- Both are security definer so they can read the withheld column, and filter
-- on auth.uid() so they only ever return the caller's own rows. search_path
-- is empty and every name is schema-qualified.

create or replace function public.my_custom_spots()
returns table (id uuid, name text, area text, category text, visibility text, minimum_age smallint)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.name, s.area, s.category, s.visibility, s.minimum_age
  from public.spots s
  where s.source = 'custom' and s.created_by_user_id = auth.uid()
  order by s.name;
$$;

create or replace function public.count_my_hosted_plans(p_from timestamptz, p_to timestamptz)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) from public.plans p
  where p.created_by_user_id = auth.uid() and p.created_at >= p_from and p.created_at < p_to;
$$;

revoke all on function public.my_custom_spots() from public, anon, authenticated;
grant execute on function public.my_custom_spots() to authenticated;
revoke all on function public.count_my_hosted_plans(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.count_my_hosted_plans(timestamptz, timestamptz) to authenticated;

-- execute_plan_command returned the whole plans row, host uid included, to
-- whoever ran a host command. Same body as migration 019 except the return
-- drops created_by_user_id. `create or replace` keeps the 021 grants.
create or replace function execute_plan_command(
  p_plan_id uuid,
  p_host_token text,
  p_command text,
  p_patch jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  target plans%rowtype;
  stored_hash text;
  finalists uuid[] := '{}';
  winner uuid;
begin
  if p_host_token is null or length(p_host_token) < 32 then
    raise exception 'Invalid host token' using errcode = '42501';
  end if;

  select * into target from plans where id = p_plan_id for update;
  select token_hash into stored_hash from plan_host_tokens where plan_id = p_plan_id;
  if target.id is null or stored_hash is null
     or stored_hash <> encode(digest(p_host_token, 'sha256'), 'hex') then
    raise exception 'Host authorization required' using errcode = '42501';
  end if;

  if p_command = 'advance' then
    if target.status <> 'open' or target.stage <> 'pool' then
      raise exception 'This plan is not ready to advance';
    end if;

    with ranked as (
      select ps.pool_number, ps.spot_id,
        count(v.id) filter (where v.value) as yes_count
      from plan_spots ps
      left join votes v on v.plan_id = ps.plan_id
        and v.spot_id = ps.spot_id
        and v.phase = 'pool'
        and v.pool_number = ps.pool_number
      where ps.plan_id = p_plan_id
      group by ps.pool_number, ps.spot_id
    ), picked as (
      select distinct on (pool_number) pool_number, spot_id
      from ranked
      order by pool_number, yes_count desc, spot_id
    )
    select coalesce(array_agg(spot_id order by pool_number), '{}') into finalists from picked;

    if cardinality(finalists) <> target.pool_count then
      raise exception 'Every pool needs a candidate';
    end if;
    update plan_spots set advanced = spot_id = any(finalists) where plan_id = p_plan_id;
    update plans set stage = 'final' where id = p_plan_id;

  elsif p_command = 'decide' then
    if target.status <> 'open' or target.stage <> 'final' then
      raise exception 'This plan is not ready to decide';
    end if;

    with ranked as (
      select ps.spot_id, count(v.id) filter (where v.value) as yes_count
      from plan_spots ps
      left join votes v on v.plan_id = ps.plan_id
        and v.spot_id = ps.spot_id
        and v.phase = 'final'
        and v.pool_number = 0
      where ps.plan_id = p_plan_id and ps.advanced
      group by ps.spot_id
    )
    select spot_id into winner from ranked order by yes_count desc, spot_id limit 1;
    if winner is null then raise exception 'The final shortlist needs a vote'; end if;
    update plans set status = 'decided', stage = 'decided', winner_spot_id = winner where id = p_plan_id;

  elsif p_command = 'patch' then
    update plans set
      event_time = case when p_patch ? 'event_time' then nullif(p_patch->>'event_time', '')::timestamptz else event_time end,
      booking_owner = case when p_patch ? 'booking_owner' then nullif(left(p_patch->>'booking_owner', 80), '') else booking_owner end,
      booked = case when p_patch ? 'booked' then (p_patch->>'booked')::boolean else booked end
    where id = p_plan_id;
  else
    raise exception 'Unsupported plan command';
  end if;

  select * into target from plans where id = p_plan_id;
  return jsonb_build_object('plan', to_jsonb(target) - 'created_by_user_id', 'winner_spot_id', target.winner_spot_id, 'finalists', finalists);
end;
$$;
