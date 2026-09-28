-- Migration 080: the host removes a member, and the removal sticks.
--
-- STAGED -- written, not applied anywhere. Apply only with the owner's
-- approval (after the security review), then record it in worklog.md the same day.
--
-- remove_plan_member(plan, seat_key): the host (plans.created_by_user_id)
-- names a member by seat_key (069: md5(plan_id:user_id), already readable by
-- members, so user_id stays hidden) and that member's rows go exactly as if
-- they had called leave_plan (073 body): an unbooked booking claim, votes and
-- "When" ticks while the plan is open, the RSVP, ratings once it isn't, and
-- plan_access. A booked claim stays: the reservation exists (078).
--
-- plan_removed_members records it, and claim_plan_access (the only path that
-- grants a non-creator plan_access) refuses that account with its own
-- message, so the join screen can say what happened instead of "bad link".
-- No policies: only these definer functions read or write it. There is no
-- un-remove; a host re-adding someone is a later item.

begin;

create table if not exists plan_removed_members (
  plan_id    uuid not null references plans(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  removed_at timestamptz not null default now(),
  primary key (plan_id, user_id)
);
alter table plan_removed_members enable row level security;
revoke all on table plan_removed_members from public, anon, authenticated;

create or replace function remove_plan_member(p_plan_id uuid, p_seat_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  target plans%rowtype;
  member uuid;
begin
  if not is_permanent_user() or uid is null then
    raise exception 'Sign in to manage this plan' using errcode = '42501';
  end if;

  -- Same lock order as leave_plan (plans, then child rows).
  select * into target from plans where id = p_plan_id for update;
  if target.id is null then
    return jsonb_build_object('result', 'not_found');
  end if;
  if target.created_by_user_id is distinct from uid then
    return jsonb_build_object('result', 'not_host');
  end if;

  select a.user_id into member from plan_access a
  where a.plan_id = p_plan_id and md5(p_plan_id::text || ':' || a.user_id::text) = p_seat_key;
  if member is null then
    return jsonb_build_object('result', 'not_member');
  end if;
  if member = uid then
    return jsonb_build_object('result', 'cannot_remove_host');
  end if;

  if target.booked is not true
     and exists (select 1 from plan_booking_owners b where b.plan_id = p_plan_id and b.user_id = member) then
    update plans set booking_owner = null where id = p_plan_id;
    delete from plan_booking_owners where plan_id = p_plan_id;
  end if;

  if target.status = 'open' then
    delete from votes where plan_id = p_plan_id and user_id = member;
    delete from plan_time_votes where plan_id = p_plan_id and seat_key = p_seat_key;
  end if;
  delete from rsvps where plan_id = p_plan_id and user_id = member;
  if target.status <> 'open' then
    delete from ratings where plan_id = p_plan_id and user_id = member;
  end if;
  delete from plan_access where plan_id = p_plan_id and user_id = member;
  insert into plan_removed_members (plan_id, user_id) values (p_plan_id, member)
  on conflict do nothing;

  return jsonb_build_object('result', 'removed');
end;
$$;
revoke all on function remove_plan_member(uuid, text) from public, anon, authenticated;
grant execute on function remove_plan_member(uuid, text) to authenticated;

-- claim_plan_access: the 067 body verbatim, plus the removed check (080).
create or replace function claim_plan_access(p_plan_id uuid)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  required_age integer;
  age_value integer;
begin
  -- 064: a permanent account is the price of taking part.
  if not is_permanent_user() then
    raise exception 'Sign in to join this plan' using errcode = '42501';
  end if;
  if uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  -- 080: key share waits out a remove_plan_member holding this row for
  -- update, so a join can't slip in between its delete and its record.
  perform 1 from plans where id = p_plan_id for key share;
  if not found then return false; end if;
  -- 080: raised, not false (false means no such plan); the message is shown verbatim.
  if exists (select 1 from plan_removed_members where plan_id = p_plan_id and user_id = uid) then
    raise exception 'The host removed you from this plan.' using errcode = '42501';
  end if;
  -- 067 (R6): a joiner meets the same age gate the host met at creation: the
  -- plan's category and every dealt spot. Raised, not false (false means no
  -- such plan); the messages are shown verbatim.
  required_age := plan_required_age(p_plan_id);
  age_value := current_member_age();
  if age_value is null then
    raise exception 'Add your date of birth to join this plan.' using errcode = '42501';
  end if;
  if age_value < required_age then
    raise exception 'This plan is for ages % and up.', required_age using errcode = '42501';
  end if;
  insert into plan_access(plan_id, user_id) values (p_plan_id, uid)
  on conflict do nothing;
  return true;
end; $$;
revoke all on function claim_plan_access(uuid) from public, anon, authenticated;
grant execute on function claim_plan_access(uuid) to authenticated;

commit;
