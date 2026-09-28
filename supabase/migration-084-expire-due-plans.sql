-- Migration 084: deadlines fire on their own.
--
-- STAGED -- written, not applied anywhere. Apply only with the owner's
-- approval (after the security review), then record it in worklog.md the same day.
--
-- Until now a plan whose deadline passed moved on only when some member's
-- browser called expire_plan (069); nobody opening it meant it stayed "open"
-- (live on 2026-09-29: one plan overdue since 2026-08-02). A pg_cron job now
-- sweeps every 5 minutes and moves overdue open plans on exactly as
-- expire_plan does: a pool round advances to the final (which gets its own
-- hour, as before), a final round decides.
--
-- One decision path: the stage branch expire_plan held moves, verbatim, into
-- advance_due_plan(), which expire_plan (a member, after its membership
-- check) and expire_due_plans() (the schedule) both call. It locks the plan
-- row and re-checks status and deadline under the lock, so a member's
-- expire_plan and the sweep can't both move the same plan, and a second run
-- is a no-op ("not_due" / "already_decided").
--
-- The sweep takes at most p_limit plans a tick (clamped 1..200, the job asks
-- for 50), oldest deadline first, `for update skip locked` so it never waits
-- on a member holding a plan, and one failing plan is skipped (its own
-- subtransaction) without stopping the rest. It logs only a plan id and a
-- SQLSTATE: nothing personal. It runs as the job's owner (postgres, like
-- 031's purge job); no client role may execute any of the three functions
-- directly except expire_plan, whose grant is unchanged.
--
-- pg_cron is already installed live (031; 1.6.4, verified 2026-09-29 by a
-- read-only catalog query). cron.schedule() with an existing job name
-- updates it in place, so re-running this is safe.

begin;

create extension if not exists pg_cron;

create or replace function advance_due_plan(p_plan_id uuid)
returns text language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  target plans%rowtype;
begin
  select * into target from plans where id = p_plan_id for update;
  if target.status = 'decided' then
    return 'already_decided';
  elsif target.deadline is null or target.deadline > now() then
    return 'not_due';
  elsif target.stage = 'pool' then
    perform plan_transition(p_plan_id, 'advance');
    return 'advanced';
  elsif target.stage = 'final' then
    perform plan_transition(p_plan_id, 'decide');
    return 'decided';
  end if;
  return 'not_due';
end; $$;
-- Internal: expire_plan and expire_due_plans call it; no client role may.
revoke all on function advance_due_plan(uuid) from public, anon, authenticated;

-- expire_plan: the 069 body with its stage branch replaced by the shared call.
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

  outcome := advance_due_plan(p_plan_id);

  select * into target from plans where id = p_plan_id;
  select coalesce(array_agg(spot_id order by pool_number), '{}') into finalists
    from plan_spots where plan_id = p_plan_id and advanced;
  return jsonb_build_object('result', outcome, 'plan', to_jsonb(target) - 'created_by_user_id',
    'winner_spot_id', target.winner_spot_id, 'finalists', finalists);
end; $$;
revoke all on function expire_plan(uuid) from public, anon, authenticated;
grant execute on function expire_plan(uuid) to authenticated;

create or replace function expire_due_plans(p_limit integer default 50)
returns integer language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  due uuid;
  moved integer := 0;
begin
  for due in
    select id from plans
    where status = 'open' and deadline <= now()
    order by deadline
    limit greatest(1, least(coalesce(p_limit, 50), 200))
    for update skip locked
  loop
    begin
      if advance_due_plan(due) in ('advanced', 'decided') then
        moved := moved + 1;
      end if;
    exception when others then
      -- One broken plan must not stop the sweep. No personal data: an id and a code.
      raise warning 'expire_due_plans: skipped plan % (SQLSTATE %)', due, sqlstate;
    end;
  end loop;
  return moved;
end; $$;
-- Run by pg_cron as the owner only.
revoke all on function expire_due_plans(integer) from public, anon, authenticated;

-- The sweep's read: open plans by deadline.
create index if not exists plans_open_deadline_idx on plans (deadline) where status = 'open';

select cron.schedule('expire-due-plans', '*/5 * * * *', 'select public.expire_due_plans(50)');

commit;
