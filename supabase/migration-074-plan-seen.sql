-- Migration 074: "what changed since you last looked" (roadmap P31, server
-- half). STAGED -- written, not applied anywhere. Applies after 069
-- (decided_at) and 073.
--
-- The /home "Your plans" rail puts first the plans that moved on since this
-- account last opened them, so a member who closed the tab comes back to the
-- decision instead of a list in creation order. Two timestamps:
--   plans.stage_changed_at   stamped by a trigger whenever stage changes
--                            (advance, decide, expire_plan, reopen, direct
--                            plans born decided), so no transition path has
--                            to remember to set it;
--   plan_access.last_seen_at the member's own, written only by
--                            touch_plan_seen(), and always now() -- never a
--                            time the client supplies.
-- my_plan_rail() is security invoker: it reads through exactly the RLS and
-- column grants a plain select on plans does, and adds only the comparison
-- PostgREST can't order by. plan_access is not in the Realtime publication,
-- so last_seen_at is never broadcast; stage_changed_at is (plans is), which
-- tells members nothing the stage change itself doesn't.

-- ── plans.stage_changed_at ───────────────────────────────────────────────────
alter table plans add column if not exists stage_changed_at timestamptz;
-- Existing plans: the latest moment on record. An advance before 074 was
-- never recorded, so a final-round plan falls back to its creation or
-- reopening: it can only sort lower, never light up.
update plans set stage_changed_at = greatest(created_at, reopened_at, decided_at)
  where stage_changed_at is null;
alter table plans alter column stage_changed_at set default now(),
  alter column stage_changed_at set not null;
grant select (stage_changed_at) on plans to authenticated;

create or replace function stamp_plan_stage_changed_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    new.stage_changed_at := now();
  end if;
  return new;
end; $$;
revoke all on function stamp_plan_stage_changed_at() from public, anon, authenticated;
drop trigger if exists plans_stamp_stage_changed_at on plans;
create trigger plans_stamp_stage_changed_at before insert or update of stage on plans
  for each row execute function stamp_plan_stage_changed_at();

-- ── plan_access.last_seen_at ─────────────────────────────────────────────────
-- A constant default for the rows already there (no table rewrite): the day
-- 074 lands, nothing is "new", and a member who joins has seen the plan as
-- it stands.
alter table plan_access add column if not exists last_seen_at timestamptz not null default now();

-- The plan page calls this on load and whenever it shows a new stage. No
-- debounce on purpose: a skipped touch right after a stage change would leave
-- a badge on a plan the member is looking at.
create or replace function touch_plan_seen(p_plan_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not is_permanent_user() then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  update plan_access set last_seen_at = now()
  where plan_id = p_plan_id and user_id = auth.uid();
  return jsonb_build_object('result', case when found then 'seen' else 'not_member' end);
end; $$;
revoke all on function touch_plan_seen(uuid) from public, anon, authenticated;
grant execute on function touch_plan_seen(uuid) to authenticated;

-- ── the rail ─────────────────────────────────────────────────────────────────
-- Changed-since-seen first, then most recently changed. A creator with no
-- plan_access row (plans older than 020) is never "changed": there is no
-- last_seen_at to compare with.
create or replace function my_plan_rail(p_limit integer default 8)
returns table (
  id uuid, title text, status text, stage text, deadline timestamptz, event_time timestamptz,
  winner_spot_id uuid, decided_at timestamptz, stage_changed_at timestamptz, changed boolean)
language sql stable security invoker set search_path = public, pg_temp as $$
  select p.id, p.title, p.status, p.stage, p.deadline, p.event_time, p.winner_spot_id, p.decided_at,
    p.stage_changed_at, coalesce(p.stage_changed_at > a.last_seen_at, false)
  from plans p
  left join plan_access a on a.plan_id = p.id and a.user_id = (select auth.uid())
  order by 10 desc, p.stage_changed_at desc, p.id
  limit least(greatest(coalesce(p_limit, 8), 1), 20)
$$;
revoke all on function my_plan_rail(integer) from public, anon, authenticated;
grant execute on function my_plan_rail(integer) to authenticated;
