-- Migration 078: booking fixes from the security reviews of 075 and 078. STAGED --
-- written, not applied anywhere. Applies after 073 and 075.
--
-- The rule it holds: while a plan is unbooked, booking_owner names someone
-- only while that account is still a member of the plan.
--   F1: deleting an account renamed an unbooked claim 'Former member' and
--       left it held by nobody -- the app offers "I'll book it" only when the
--       name is empty, so nobody could take it. Now it is cleared; unmarking
--       a booking clears a claim whose holder has gone; existing rows too.
--   F2: a link-holder who joined after the decision could claim and mark it
--       booked, which blocks reopen_plan. Now the host can release any
--       unbooked claim, and only a holder who was there before the decision
--       (or the host) can mark it booked.
-- leave_plan needs nothing: it already clears its caller's unbooked claim.
--
-- Apply at a quiet time: the one-time cleanup below reads under READ
-- COMMITTED, so a claim committed mid-apply could lose its name. Count what
-- it will clear first:
--   select count(*) from plans p where p.booked is not true and p.booking_owner is not null
--     and not exists (select 1 from plan_booking_owners b join plan_access a
--                     on a.plan_id = b.plan_id and a.user_id = b.user_id where b.plan_id = p.id);

begin;

-- delete_my_account (073 body, copied verbatim, edited where marked 078).
create or replace function delete_my_account(p_probe boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  uid uuid := auth.uid();
  left_over integer;
  deleted_logins integer;
  plans_deleted integer := 0;
  plans_kept integer := 0;
  votes_kept integer := 0;
  spots_deleted integer := 0;
  spots_orphaned integer := 0;
begin
  if uid is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;

  -- p_probe: can this function actually remove the login? The route asks
  -- BEFORE it deletes any photo, because photo deletion cannot be undone and
  -- the rest of this function rolls back. auth.users is owned by
  -- supabase_auth_admin and has RLS with no policies, so a definer that lacks
  -- the privilege would either raise (caught here) or -- the dangerous one --
  -- delete 0 rows and look like success. The probe deletes for real inside a
  -- block, checks the row count, then raises to roll that delete back.
  if p_probe then
    begin
      delete from auth.users where id = uid;
      get diagnostics deleted_logins = row_count;
      if deleted_logins <> 1 then
        return jsonb_build_object('result', 'cannot_delete_login', 'rows', deleted_logins);
      end if;
      -- A private SQLSTATE, not the default P0001: a trigger or a constraint on
      -- auth.users raising P0001 of its own would otherwise be caught here and
      -- read as success. Anything but this code propagates and fails the call.
      raise exception 'probe' using errcode = 'PT060';
    exception
      when sqlstate 'PT060' then return jsonb_build_object('result', 'ready');
      when insufficient_privilege then return jsonb_build_object('result', 'cannot_delete_login');
    end;
  end if;

  -- The route has already emptied the bucket folder and confirmed by listing.
  -- This is the server-side proof of that, before anything is deleted. Both
  -- halves matter: owner_id is what the delete policy keys on, and the path
  -- prefix is what the UPLOAD policy keys on, so an object with a null or
  -- mismatched owner_id under this user's folder is still counted here rather
  -- than left behind for ever.
  select count(*) into left_over from storage.objects
  where bucket_id = 'visit-photos'
    and (owner_id = uid::text or name like uid::text || '/%');
  if left_over > 0 then
    return jsonb_build_object('result', 'storage_remaining', 'files', left_over);
  end if;

  -- Every plans row this function touches, locked in id order, before any
  -- write: the plans it hosts AND the plans it only belongs to, whose votes and
  -- booking_owner are edited below. Locking only the hosted ones left a
  -- votes-then-plans order on the others, which is the opposite of
  -- delete_plan/leave_plan/advance/decide (plans, then child rows) and could
  -- deadlock against them.
  perform 1 from plans p
  where p.created_by_user_id = uid
     or exists (select 1 from plan_access a where a.plan_id = p.id and a.user_id = uid)
     or exists (select 1 from votes v where v.plan_id = p.id and v.user_id = uid)
     or exists (select 1 from rsvps r where r.plan_id = p.id and r.user_id = uid)
  order by p.id for update;

  with doomed as (
    select p.id from plans p
    where p.created_by_user_id = uid
      and (p.status = 'open'
           or not exists (select 1 from plan_access a
                          where a.plan_id = p.id and a.user_id <> uid))
  ), gone as (
    delete from plans where id in (select id from doomed) returning 1
  )
  select count(*) into plans_deleted from gone;

  -- What is left is a decided plan someone else joined: keep it, but make sure
  -- no host command can ever run on it again.
  delete from plan_host_tokens t
  using plans p where p.id = t.plan_id and p.created_by_user_id = uid;
  select count(*) into plans_kept from plans where created_by_user_id = uid;

  delete from votes v using plans p
  where p.id = v.plan_id and v.user_id = uid and p.status = 'open';

  with anon_votes as (
    update votes set voter_name = 'Former member', participant_token_hash = null, user_id = null
    where user_id = uid returning 1
  )
  select count(*) into votes_kept from anon_votes;

  -- Only where the name on THIS plan is this user's RSVP name on THIS plan.
  -- Matching on every name the user ever used, anywhere, would rename a
  -- different member who happens to share it (two people called Sara), and
  -- would let someone RSVP under another plan's booking_owner name in a
  -- throwaway plan and wipe it by deleting their account.
  -- booked is true means the reservation exists in the real world: leave the
  -- name alone, exactly as leave_plan does.
  -- 069: matched by the account that claimed the booking, not by name.
  -- 078: an unbooked claim goes with the account -- name cleared, row
  -- removed -- so any member is offered "I'll book it" again. A 'Former
  -- member' label kept it held by nobody (security review F1).
  update plans p set booking_owner = null
  where p.booked is not true
    and exists (select 1 from plan_booking_owners b where b.plan_id = p.id and b.user_id = uid);
  delete from plan_booking_owners b using plans p
  where b.plan_id = p.id and b.user_id = uid and p.booked is not true;

  -- 073: "When" ticks carry only the per-plan seat_key, so it is matched plan
  -- by plan. ponytail: scans plan_time_votes; index seat_key if it ever grows.
  delete from plan_time_votes t where t.seat_key = md5(t.plan_id::text || ':' || uid::text);
  delete from rsvps where user_id = uid;
  delete from ratings where user_id = uid;


  -- app_rate_limits.subject is the raw uid as text with no FK, so these rows
  -- would outlive the account.
  delete from app_rate_limits where subject = uid::text;

  -- The profile carries the personal layer: visits and their photos rows,
  -- collections, moodboards, place lists and imports, friendships both ways,
  -- invites sent, and this profile's companion tags on other people's visits.
  delete from people where auth_user_id = uid;

  -- Custom spots nothing else points at go with the account; the rest are kept
  -- as ownerless community data by the FK above.
  with mine as (
    select s.id from spots s
    where s.created_by_user_id = uid and s.source <> 'curated'
      and not exists (select 1 from plan_spots x where x.spot_id = s.id)
      and not exists (select 1 from votes x where x.spot_id = s.id)
      and not exists (select 1 from ratings x where x.spot_id = s.id)
      and not exists (select 1 from visits x where x.spot_id = s.id)
      and not exists (select 1 from plans x where x.winner_spot_id = s.id)
      and not exists (select 1 from place_collection_items x where x.spot_id = s.id)
      and not exists (select 1 from place_imports x where x.resolved_spot_id = s.id)
  ), gone as (
    delete from spots where id in (select id from mine) returning 1
  )
  select count(*) into spots_deleted from gone;
  select count(*) into spots_orphaned from spots where created_by_user_id = uid;

  -- Counts only: no name, no email, no dates. actor_user_id is set null by its
  -- own FK a moment later, so the row survives the account without pointing at
  -- a person.
  insert into security_events (event_type, outcome, actor_user_id, metadata)
  values ('account_deleted', 'success', uid, jsonb_build_object(
    'plans_deleted', plans_deleted, 'plans_kept', plans_kept,
    'votes_anonymised', votes_kept, 'spots_deleted', spots_deleted,
    'spots_orphaned', spots_orphaned));

  -- Last: the login, and with it member_ages, plan_access, the auth sessions
  -- and identities. Nothing below this line.
  -- RLS on auth.users with no policies removes 0 rows instead of raising, so a
  -- missing privilege would read as success and leave a login with no data --
  -- this repo's own commonest bug shape. Assert the row count and let the
  -- whole transaction roll back if it is not exactly one.
  delete from auth.users where id = uid;
  get diagnostics deleted_logins = row_count;
  if deleted_logins <> 1 then
    raise exception 'delete_my_account removed % auth.users rows', deleted_logins
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'result', 'deleted',
    'plans_deleted', plans_deleted, 'plans_kept', plans_kept,
    'votes_anonymised', votes_kept, 'spots_deleted', spots_deleted,
    'spots_orphaned', spots_orphaned);
end;
$$;
revoke all on function delete_my_account(boolean) from public, anon, authenticated;
grant execute on function delete_my_account(boolean) to authenticated;

-- release_booking and mark_booked (075 bodies, copied verbatim, edited where marked 078).
create or replace function release_booking(p_plan_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target plans%rowtype;
begin
  if not is_permanent_user() then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  select * into target from plans where id = p_plan_id for update;
  if target.id is null then
    return jsonb_build_object('result', 'not_found');
  end if;
  if not exists (select 1 from plan_access where plan_id = p_plan_id and user_id = auth.uid()) then
    return jsonb_build_object('result', 'not_member');
  end if;
  -- Booked means the reservation exists: the name stays, as leave_plan keeps it.
  if target.booked is true then
    return booking_result('booked', target);
  end if;
  -- 078: the host may clear any unbooked claim too, so a claim can never
  -- hold a plan the host wants to reopen (security review F2a).
  if not exists (select 1 from plan_booking_owners where plan_id = p_plan_id and user_id = auth.uid())
     and not plan_host_authorized(p_plan_id, null) then
    return booking_result('not_yours', target);
  end if;
  update plans set booking_owner = null where id = p_plan_id returning * into target;
  delete from plan_booking_owners where plan_id = p_plan_id;
  return booking_result('released', target);
end; $$;
revoke all on function release_booking(uuid) from public, anon, authenticated;
grant execute on function release_booking(uuid) to authenticated;

create or replace function mark_booked(p_plan_id uuid, p_booked boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target plans%rowtype;
begin
  if not is_permanent_user() then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  select * into target from plans where id = p_plan_id for update;
  if target.id is null then
    return jsonb_build_object('result', 'not_found');
  end if;
  if not exists (select 1 from plan_access where plan_id = p_plan_id and user_id = auth.uid()) then
    return jsonb_build_object('result', 'not_member');
  end if;
  if target.status <> 'decided' then
    return booking_result('not_decided', target);
  end if;
  if p_booked is null then
    return booking_result('invalid', target);
  end if;
  if not plan_host_authorized(p_plan_id, null)
     and not exists (select 1 from plan_booking_owners where plan_id = p_plan_id and user_id = auth.uid()) then
    return booking_result('not_holder', target);
  end if;
  -- 078: a holder who joined after the decision may not mark it booked (the
  -- host still can): a booked plan can't be reopened, and a link-holder who
  -- arrives late must not be able to lock it -- 069's plan_has_happened rule
  -- (security review F2b). Only where there is a reopen to lock: a plan with
  -- one finalist (a direct plan, born decided) can't be reopened. Unmarking
  -- stays open to them.
  if p_booked and not plan_host_authorized(p_plan_id, null)
     and (select count(*) from plan_spots where plan_id = p_plan_id and advanced) >= 2
     and not exists (
      select 1 from plan_access a
      where a.plan_id = p_plan_id and a.user_id = auth.uid() and a.created_at < target.decided_at) then
    return booking_result('joined_after_decision', target);
  end if;
  update plans set booked = p_booked where id = p_plan_id returning * into target;
  -- 078: unbooked again, a claim whose holder is gone (account deleted, or
  -- left while it was booked) is cleared, so any member can take it (F1).
  if not p_booked and not exists (
      select 1 from plan_booking_owners b
      join plan_access a on a.plan_id = b.plan_id and a.user_id = b.user_id
      where b.plan_id = p_plan_id) then
    update plans set booking_owner = null where id = p_plan_id returning * into target;
    delete from plan_booking_owners where plan_id = p_plan_id;
  end if;
  return booking_result(case when p_booked then 'marked' else 'unmarked' end, target);
end; $$;
revoke all on function mark_booked(uuid, boolean) from public, anon, authenticated;
grant execute on function mark_booked(uuid, boolean) to authenticated;


-- execute_plan_command (069 body, copied verbatim, edited where marked 078).
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
      -- 069: the label is the claimer's own name (profile, else the text sent),
      -- so it always names the account recorded in plan_booking_owners.
      booking_owner = case when p_patch ? 'booking_owner' then
        case when nullif(clean_app_text(p_patch->>'booking_owner', 80), '') is null then null
             else nullif(clean_display_name(coalesce(
               (select pe.display_name from people pe where pe.auth_user_id = auth.uid()),
               p_patch->>'booking_owner')), '') end
        else booking_owner end,
      booked = case when p_patch ? 'booked' then (p_patch->>'booked')::boolean else booked end
    where id = p_plan_id;
    -- 069: record which account holds the booking claim (the label stays in plans).
    if p_patch ? 'booking_owner' then
      if nullif(clean_app_text(p_patch->>'booking_owner', 80), '') is null then
        delete from plan_booking_owners where plan_id = p_plan_id;
      else
        insert into plan_booking_owners (plan_id, user_id) values (p_plan_id, auth.uid())
        on conflict (plan_id) do update set user_id = excluded.user_id;
      end if;
    end if;
    -- 078: unbooking here clears a claim whose holder is gone, as mark_booked
    -- does, so this older host path can't recreate a claim held by nobody.
    if p_patch ? 'booked' and (p_patch->>'booked')::boolean is false and not exists (
        select 1 from plan_booking_owners b
        join plan_access a on a.plan_id = b.plan_id and a.user_id = b.user_id
        where b.plan_id = p_plan_id) then
      update plans set booking_owner = null where id = p_plan_id;
      delete from plan_booking_owners where plan_id = p_plan_id;
    end if;
  else
    raise exception 'Unsupported plan command';
  end if;

  select * into target from plans where id = p_plan_id;
  return jsonb_build_object('plan', to_jsonb(target) - 'created_by_user_id', 'winner_spot_id', target.winner_spot_id, 'finalists', finalists);
end;
$$;
revoke all on function execute_plan_command(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function execute_plan_command(uuid, text, text, jsonb) to authenticated;

-- Plans already in that state: an unbooked claim whose holder is not a
-- member (deleted account, 'Former member'; or no recorded holder at all).
-- While unbooked, a named claim always belongs to a current member.
update plans p set booking_owner = null
where p.booked is not true and p.booking_owner is not null
  and not exists (select 1 from plan_booking_owners b
                  join plan_access a on a.plan_id = b.plan_id and a.user_id = b.user_id
                  where b.plan_id = p.id);
delete from plan_booking_owners b using plans p
where b.plan_id = p.id and p.booked is not true
  and not exists (select 1 from plan_access a where a.plan_id = b.plan_id and a.user_id = b.user_id);

commit;
