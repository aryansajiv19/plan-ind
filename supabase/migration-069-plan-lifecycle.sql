-- Migration 069: plan lifecycle (roadmap Phase 1). STAGED -- written, not
-- applied anywhere. Applies after 068, at go-live. docs/ROADMAP.md items:
--   P4  deadlines fire without the host (expire_plan)
-- Bodies are copied from their latest definitions and edited where marked 069.

-- ── P4: deadlines fire without the host ────────────────────────────────────

create or replace function plan_transition(p_plan_id uuid, p_command text)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  target plans%rowtype;
  finalists uuid[] := '{}';
  winner uuid;
begin
  select * into target from plans where id = p_plan_id for update;
  if target.id is null then
    raise exception 'That plan does not exist' using errcode = '22023';
  end if;

  if p_command = 'advance' then
    -- 067 (F5): already advanced or decided -- e.g. the host's other device
    -- got there first. Same answer as the first call, not an error.
    if target.status <> 'open' or target.stage in ('final', 'decided') then
      select coalesce(array_agg(spot_id order by pool_number), '{}') into finalists
        from plan_spots where plan_id = p_plan_id and advanced;
      return jsonb_build_object('plan', to_jsonb(target) - 'created_by_user_id',
        'winner_spot_id', target.winner_spot_id, 'finalists', finalists);
    end if;
    if target.stage <> 'pool' then
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
      -- 067 (F4): a tie, or a pool nobody voted in, goes to a per-plan hash --
      -- stable within the plan, but not the same catalogue venues every time.
      order by pool_number, yes_count desc, md5(p_plan_id::text || spot_id::text)
    )
    select coalesce(array_agg(spot_id order by pool_number), '{}') into finalists from picked;

    if cardinality(finalists) <> target.pool_count then
      raise exception 'Every pool needs a candidate';
    end if;
    update plan_spots set advanced = spot_id = any(finalists) where plan_id = p_plan_id;
    -- 067 (R1): the final round gets real time to vote; advancing at the
    -- deadline used to leave it none. A plan with no deadline keeps none.
    update plans set stage = 'final',
      deadline = case when deadline is null then null else greatest(deadline, now() + interval '1 hour') end
    where id = p_plan_id;

  elsif p_command = 'decide' then
    -- 067 (F5): already decided: return it, as for advance above.
    if target.status = 'decided' then
      select coalesce(array_agg(spot_id order by pool_number), '{}') into finalists
        from plan_spots where plan_id = p_plan_id and advanced;
      return jsonb_build_object('plan', to_jsonb(target) - 'created_by_user_id',
        'winner_spot_id', target.winner_spot_id, 'finalists', finalists);
    end if;
    if target.status <> 'open' or target.stage <> 'final' then
      raise exception 'This plan is not ready to decide';
    end if;

    -- 067 (R1): a final-round tie, including no final votes at all, goes to
    -- the finalist its own pool round liked most, then to the earlier round.
    -- Finalists come one per pool, so the lowest uuid never decides.
    with ranked as (
      select ps.spot_id, ps.pool_number,
        count(v.id) filter (where v.value and v.phase = 'final' and v.pool_number = 0) as yes_count,
        count(v.id) filter (where v.value and v.phase = 'pool' and v.pool_number = ps.pool_number) as pool_yes
      from plan_spots ps
      left join votes v on v.plan_id = ps.plan_id and v.spot_id = ps.spot_id
      where ps.plan_id = p_plan_id and ps.advanced
      group by ps.spot_id, ps.pool_number
    )
    select spot_id into winner from ranked
      order by yes_count desc, pool_yes desc, pool_number, spot_id limit 1;
    if winner is null then raise exception 'The final shortlist needs a vote'; end if;
    update plans set status = 'decided', stage = 'decided', winner_spot_id = winner where id = p_plan_id;
  else
    raise exception 'Unsupported plan command';
  end if;

  select * into target from plans where id = p_plan_id;
  return jsonb_build_object('plan', to_jsonb(target) - 'created_by_user_id', 'winner_spot_id', target.winner_spot_id, 'finalists', finalists);
end;
$$;
-- Internal: execute_plan_command (host) and expire_plan (any member, only once
-- the deadline has passed) are its only callers.
revoke all on function plan_transition(uuid, text) from public, anon, authenticated;

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
  finalists uuid[] := '{}';
begin
  select * into target from plans where id = p_plan_id for update;
  -- 067 (B7/R14): the one host rule (plan_host_authorized). It had no
  -- creator binding before, so a leftover token worked for any account.
  if target.id is null or not plan_host_authorized(p_plan_id, p_host_token) then
    raise exception 'Host authorization required' using errcode = '42501';
  end if;

  -- 069 (P4): advance/decide live in plan_transition, shared with expire_plan.
  if p_command in ('advance', 'decide') then
    return plan_transition(p_plan_id, p_command);
  elsif p_command = 'patch' then
    update plans set
      event_time = case when p_patch ? 'event_time' then nullif(p_patch->>'event_time', '')::timestamptz else event_time end,
      booking_owner = case when p_patch ? 'booking_owner' then nullif(clean_app_text(p_patch->>'booking_owner', 80), '') else booking_owner end,
      booked = case when p_patch ? 'booked' then (p_patch->>'booked')::boolean else booked end
    where id = p_plan_id;
  else
    raise exception 'Unsupported plan command';
  end if;

  select * into target from plans where id = p_plan_id;
  return jsonb_build_object('plan', to_jsonb(target) - 'created_by_user_id', 'winner_spot_id', target.winner_spot_id, 'finalists', finalists);
end;
$$;
revoke all on function execute_plan_command(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function execute_plan_command(uuid, text, text, jsonb) to authenticated;

-- 069 (P4): the deadline fires without the host. Any member's client calls
-- this on load and when the deadline passes; it moves the plan on only when
-- the deadline really has passed, so it can never close a round early.
-- Idempotent: the plan row lock serialises callers, and the rest find the new
-- state ('not_due' once advance has given the final round its hour).
create or replace function expire_plan(p_plan_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  target plans%rowtype;
  outcome text;
  finalists uuid[];
begin
  if not is_permanent_user() or not exists (
    select 1 from plan_access where plan_id = p_plan_id and user_id = auth.uid()
  ) then
    raise exception 'Plan access required' using errcode = '42501';
  end if;

  select * into target from plans where id = p_plan_id for update;
  if target.status = 'decided' then
    outcome := 'already_decided';
  elsif target.deadline is null or target.deadline > now() then
    outcome := 'not_due';
  elsif target.stage = 'pool' then
    perform plan_transition(p_plan_id, 'advance');
    outcome := 'advanced';
  elsif target.stage = 'final' then
    perform plan_transition(p_plan_id, 'decide');
    outcome := 'decided';
  else
    outcome := 'not_due';
  end if;

  select * into target from plans where id = p_plan_id;
  select coalesce(array_agg(spot_id order by pool_number), '{}') into finalists
    from plan_spots where plan_id = p_plan_id and advanced;
  return jsonb_build_object('result', outcome, 'plan', to_jsonb(target) - 'created_by_user_id',
    'winner_spot_id', target.winner_spot_id, 'finalists', finalists);
end; $$;
revoke all on function expire_plan(uuid) from public, anon, authenticated;
grant execute on function expire_plan(uuid) to authenticated;
