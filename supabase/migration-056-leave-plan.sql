-- Migration 056 — leave_plan (C6): a member (not the host) leaves a plan.
-- Apply after 055. Additive (new function only), re-run safe. STAGED.
--
-- Result codes: left | not_member | host_cannot_leave | not_found.
-- Anonymous guests may leave (they are members too); the host is refused and
-- deletes the plan instead (047).
--
-- What goes, identity = user_id = auth.uid() only (legacy null-user_id rows are
-- never touched, same rule as 052/053):
--   OPEN plan    : the caller's votes in every round, their RSVP (with carpool
--                  fields) and their plan_access. The live tally dropping is
--                  intended: someone who left no longer counts toward an
--                  undecided choice. Finalists already advanced stay advanced.
--   DECIDED plan : votes are KEPT (the record of how the group decided, so the
--                  shown tally never contradicts the winner); RSVP, rating and
--                  plan_access are removed.
-- Rejoining with the same link is allowed (claim_plan_access) and starts
-- fresh. Leaving is not a ban.
--
-- The plans row is locked `for update`, the same lock advance/decide take, so a
-- leave and a decide on one plan serialise.
--
-- ACCEPTED RACE (reviewed, reproduced on the rig): cast_plan_vote, set_plan_rsvp
-- and rate_plan check membership before taking any lock on the plans row. If the
-- leaver's OWN vote, RSVP or rating passes that check while this function holds
-- the plans lock, the insert waits at its foreign-key check, this function
-- commits, and the insert then commits too: one counted vote, RSVP or rating
-- from someone who has left. Self-inflicted and bounded to the leaver (updates
-- are safe: the row lock makes this delete wait and remove the updated row).
-- NOT fixed with a lock in the membership trigger: on the upsert/update path
-- that order (child row, then plans) can deadlock against delete_plan/
-- leave_plan (plans, then child rows). The correct fix is `for key share` on
-- the plans read those three RPCs already do, which also closes an older race
-- where a vote lands after advance/decide. Tracked with migration 053, which
-- rewrites the same three functions.

create or replace function leave_plan(p_plan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  target plans%rowtype;
begin
  if uid is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;

  select * into target from plans where id = p_plan_id for update;
  if target.id is null then
    return jsonb_build_object('result', 'not_found');
  end if;
  if target.created_by_user_id = uid then
    return jsonb_build_object('result', 'host_cannot_leave');
  end if;
  if not exists (select 1 from plan_access where plan_id = p_plan_id and user_id = uid) then
    return jsonb_build_object('result', 'not_member');
  end if;

  if target.status = 'open' then
    delete from votes where plan_id = p_plan_id and user_id = uid;
  end if;
  delete from rsvps where plan_id = p_plan_id and user_id = uid;
  if target.status <> 'open' then
    delete from ratings where plan_id = p_plan_id and user_id = uid;
  end if;
  delete from plan_access where plan_id = p_plan_id and user_id = uid;

  return jsonb_build_object('result', 'left');
end;
$$;

revoke all on function leave_plan(uuid) from public, anon, authenticated;
grant execute on function leave_plan(uuid) to authenticated;
