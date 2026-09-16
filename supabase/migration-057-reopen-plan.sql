-- Migration 057 — reopen_plan (C7): the host reopens a decided plan. Apply
-- after 056. Additive (new function only), re-run safe. STAGED.
--
-- Result codes: reopened | not_found | not_host | not_decided | no_rounds |
-- booked | already_happened | invalid_deadline.
-- Auth is delete_plan's/edit_plan's: signed in, not anonymous, the creator AND
-- the host token, with the plans row locked `for update`.
--
-- Returns to the FINAL round (status 'open', stage 'final', winner cleared). The
-- advanced finalists and the final-round votes are kept: they came from real
-- votes, so this undoes the decision, not the rounds. A plan with fewer than two
-- advanced finalists (a direct plan, or a legacy plan with one) has nothing to
-- re-vote on: no_rounds.
--
-- Votes from people who have LEFT are removed on reopen (security review,
-- Medium): leave_plan keeps votes on a decided plan as the record of that
-- decision, but once the decision is undone those votes must not help pick the
-- next winner. Only votes with a user_id and no plan_access row are removed;
-- legacy votes (user_id null) cannot be attributed and stay.
--
-- Refused to protect the real world:
--   booked = true            -> booked (a reservation exists; untick it first)
--   any rating or logged visit
--   pointing at the plan     -> already_happened (the outing happened)
-- Because of already_happened, reopen-then-delete_plan cannot wipe a plan that
-- actually took place; deleting a decided plan that never happened, after
-- reopening it, is the host's call and is intended.
-- A successful reopen writes one security_events audit row, like delete_plan.
-- Kept: RSVPs and carpool fields (attendance, not the place), booking_owner and
-- event_time (booked is false by the rule above), visits that point at the plan.
--
-- Deadline: the host's page auto-decides once a deadline passes, so a reopened
-- plan with a past deadline would re-decide at once. p_deadline given ->
-- validated like creation (future, at most a year out) and set; not given ->
-- deadline is cleared (no auto-decide; the host decides manually).
--
-- ACCEPTED RACE (same class as 056, closed by the 053 key-share fix): rate_plan
-- reads the plan without taking its lock, so a rating that passed rate_plan's
-- "decided" check can commit after this function's already_happened check. The
-- result is a rating on a reopened plan. Rare and self-evident; not locking the
-- rating path here.

create or replace function reopen_plan(
  p_plan_id uuid,
  p_host_token text,
  p_deadline timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  target plans%rowtype;
  stored_hash text;
begin
  if auth.uid() is null or coalesce(auth.jwt()->>'is_anonymous', 'false') = 'true' then
    raise exception 'Sign in required' using errcode = '42501';
  end if;

  select * into target from plans where id = p_plan_id for update;
  if target.id is null then
    return jsonb_build_object('result', 'not_found');
  end if;

  select token_hash into stored_hash from plan_host_tokens where plan_id = p_plan_id;
  if target.created_by_user_id is distinct from auth.uid()
     or p_host_token is null or length(p_host_token) < 32 or stored_hash is null
     or stored_hash <> encode(digest(p_host_token, 'sha256'), 'hex') then
    return jsonb_build_object('result', 'not_host');
  end if;

  if target.status <> 'decided' then
    return jsonb_build_object('result', 'not_decided');
  end if;
  -- Direct plans insert their single spot with advanced = true: fewer than two
  -- advanced finalists means there is nothing to re-vote on.
  if (select count(*) from plan_spots where plan_id = p_plan_id and advanced) < 2 then
    return jsonb_build_object('result', 'no_rounds');
  end if;
  if target.booked is true then
    return jsonb_build_object('result', 'booked');
  end if;
  if exists (select 1 from ratings where plan_id = p_plan_id)
     or exists (select 1 from visits where plan_id = p_plan_id) then
    return jsonb_build_object('result', 'already_happened');
  end if;
  if p_deadline is not null and (p_deadline <= now() or p_deadline > now() + interval '1 year') then
    return jsonb_build_object('result', 'invalid_deadline');
  end if;

  delete from votes v
  where v.plan_id = p_plan_id and v.user_id is not null
    and not exists (select 1 from plan_access a where a.plan_id = p_plan_id and a.user_id = v.user_id);

  update plans set
    status = 'open',
    stage = 'final',
    winner_spot_id = null,
    deadline = p_deadline
  where id = p_plan_id;

  insert into security_events (event_type, outcome, actor_user_id, metadata)
  values ('plan_command', 'success', auth.uid(),
    jsonb_build_object('command', 'reopen', 'plan_id', p_plan_id));

  return jsonb_build_object('result', 'reopened', 'deadline', p_deadline);
end;
$$;

revoke all on function reopen_plan(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function reopen_plan(uuid, text, timestamptz) to authenticated;
