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
-- Booking: if the leaver's RSVP name is the plan's booking_owner and nothing is
-- booked yet (booked is not true), booking_owner is cleared so the plan doesn't
-- name someone who left. If booked is true the booking exists in the real
-- world, so booking_owner is kept rather than making the plan claim nobody
-- holds it. A driver's seats leave the carpool list with their RSVP: correct,
-- they're not coming.
-- Accepted (review Low): the match is by name, so a member who RSVPs under an
-- unbooked booker's name (only possible while that person has no RSVP) and
-- then leaves clears the name. Visible as a squatted RSVP, host can re-set it,
-- and it can never touch a booking that exists. Exact match kept on purpose:
-- loosening it would widen this.
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
  leaver_name text;
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

  select voter_name into leaver_name from rsvps where plan_id = p_plan_id and user_id = uid;
  if leaver_name is not null and target.booking_owner = leaver_name and target.booked is not true then
    update plans set booking_owner = null where id = p_plan_id;
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
