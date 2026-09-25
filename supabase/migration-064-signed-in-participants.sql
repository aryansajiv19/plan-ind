-- Migration 064: plan participants must hold a permanent account. Apply after
-- 061 (the vote/rsvp/rating bodies below are 061's). STAGED -- written, not
-- applied anywhere. Owner decision 2026-09-25.
--
-- Why: 061 made a ballot one per account, but an anonymous guest session costs
-- nothing -- a private window mints a fresh auth.uid() and votes again. From
-- here on, an account (email OTP or Google) is the price of a ballot.
--
-- Helper: is_permanent_user() from 020 (uid present and the JWT's
-- is_anonymous claim not true). Reused, not redefined; it is SECURITY INVOKER
-- with search_path pg_catalog and already backs the social and photo policies.
--
-- 1. Refused for anonymous sessions (42501, a readable 'Sign in to ...'):
--    claim_plan_access, cast_plan_vote, set_plan_rsvp, rate_plan, unrate_plan,
--    leave_plan. Signatures unchanged (create or replace); grants re-applied.
-- 2. Reads refused too: every plan_access-scoped policy now also requires
--    is_permanent_user() -- plan_access, plans, plan_spots, votes, rsvps,
--    ratings, the plan branch of "read permitted spots", and both plan
--    presence policies on realtime.messages. Realtime postgres_changes applies
--    the same table RLS, so guests stop receiving row broadcasts as well.
--    Curated/community/own spots stay readable to any session as before.
--
-- Existing anonymous members: their plan_access, vote, rsvp and rating rows
-- are LEFT IN PLACE. Nothing is deleted. They are inert -- the guest can no
-- longer read or write through them -- and votes already cast still count in
-- the tally, as they did when cast. If that guest later upgrades the same
-- session to a permanent account (Supabase keeps the uid), the membership
-- simply works again.
--
-- Deliberately unchanged:
--   * enforce_plan_membership trigger: delete_my_account (060) anonymises a
--     leaver's votes by UPDATE under the caller's own session; a permanence
--     check there would stop a guest deleting their account.
--   * execute_plan_command / edit_plan / reopen_plan / delete_plan: host-token
--     gated, and only a permanent account can create a plan (hence hold a
--     token). The command route already 401s anonymous users.
--   * plan_share_preview (062): keyless by design for link unfurls.
--
-- Re-run safe: create or replace / alter policy. No row shape changes;
-- lib/types.ts unaffected.

-- ── 1. Participant RPCs refuse anonymous sessions ─────────────────────────
-- Bodies are the current (056/061) versions verbatim plus one guard each.
-- create or replace keeps the signatures and ACLs; grants re-applied below.

create or replace function claim_plan_access(p_plan_id uuid)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  -- 064: a permanent account is the price of taking part.
  if not is_permanent_user() then
    raise exception 'Sign in to join this plan' using errcode = '42501';
  end if;
  if uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not exists (select 1 from plans where id = p_plan_id) then return false; end if;
  insert into plan_access(plan_id, user_id) values (p_plan_id, uid)
  on conflict do nothing;
  return true;
end; $$;

create or replace function cast_plan_vote(
  p_plan_id uuid, p_spot_id uuid, p_voter_name text, p_value boolean,
  p_phase text, p_pool_number smallint, p_participant_token_hash text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target plans%rowtype;
  clean_name text := clean_display_name(p_voter_name);
  caller uuid := auth.uid();
begin
  -- 064: a permanent account is the price of taking part.
  if not is_permanent_user() then
    raise exception 'Sign in to vote on this plan' using errcode = '42501';
  end if;
  if caller is null or p_participant_token_hash is null
     or p_participant_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Participant authorization required' using errcode = '42501';
  end if;
  if exists (
    select 1 from votes v
    where v.plan_id = p_plan_id and v.participant_token_hash = p_participant_token_hash
      and v.user_id is distinct from caller
  ) then
    raise exception 'That participant identity belongs to someone else' using errcode = '42501';
  end if;
  if clean_name = '' then
    raise exception 'Enter a name before voting' using errcode = '22023';
  end if;
  if p_phase is null or p_phase not in ('pool', 'final') or p_pool_number is null then
    raise exception 'Unsupported voting phase' using errcode = '22023';
  end if;

  select * into target from plans where id = p_plan_id;
  if target.id is null or target.status <> 'open' then
    raise exception 'This plan is not open for voting' using errcode = '22023';
  end if;
  if target.deadline is not null and target.deadline <= now() then
    raise exception 'Voting on this plan has closed' using errcode = '22023';
  end if;
  if p_phase <> target.stage then
    raise exception 'This round is no longer open' using errcode = '22023';
  end if;
  if p_phase = 'pool' and (p_pool_number < 1 or p_pool_number > target.pool_count) then
    raise exception 'That round does not exist' using errcode = '22023';
  end if;
  if p_phase = 'final' and p_pool_number <> 0 then
    raise exception 'That round does not exist' using errcode = '22023';
  end if;
  if not exists (
    select 1 from plan_spots ps
    where ps.plan_id = p_plan_id and ps.spot_id = p_spot_id
      and (p_phase = 'final' or ps.pool_number = p_pool_number)
      and (p_phase = 'pool' or ps.advanced)
  ) then
    raise exception 'That place is not on this plan' using errcode = '22023';
  end if;

  if p_value then
    insert into votes (plan_id, spot_id, voter_name, value, phase, pool_number, participant_token_hash, user_id)
    values (p_plan_id, p_spot_id, clean_name, true, p_phase, p_pool_number, p_participant_token_hash, caller)
    on conflict (plan_id, user_id, phase, pool_number) where user_id is not null
      do update set spot_id = excluded.spot_id, voter_name = excluded.voter_name,
                    value = true, participant_token_hash = excluded.participant_token_hash;
  else
    delete from votes
      where plan_id = p_plan_id and user_id = caller
        and phase = p_phase and pool_number = p_pool_number;
  end if;

  return jsonb_build_object(
    'plan_id',     p_plan_id,
    'phase',       p_phase,
    'pool_number', p_pool_number,
    'spot_id',     case when p_value then p_spot_id else null end
  );
end; $$;

create or replace function set_plan_rsvp(
  p_plan_id uuid, p_voter_name text, p_coming boolean, p_choice text, p_participant_token_hash text,
  p_transport text default null, p_seats_available smallint default null
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing rsvps%rowtype;
  target plans%rowtype;
  clean_name text := clean_display_name(p_voter_name);
  caller uuid := auth.uid();
begin
  -- 064: a permanent account is the price of taking part.
  if not is_permanent_user() then
    raise exception 'Sign in to reply to this plan' using errcode = '42501';
  end if;
  if caller is null or p_participant_token_hash is null
     or p_participant_token_hash !~ '^[0-9a-f]{64}$'
     or p_choice is null or p_choice not in ('coming', 'maybe', 'no') then
    raise exception 'Participant authorization required' using errcode = '42501';
  end if;
  if exists (
    select 1 from rsvps r
    where r.plan_id = p_plan_id and r.participant_token_hash = p_participant_token_hash
      and r.user_id is distinct from caller
  ) then
    raise exception 'That participant identity belongs to someone else' using errcode = '42501';
  end if;
  if clean_name = '' then
    raise exception 'Enter a name before replying' using errcode = '22023';
  end if;
  if p_transport is not null and p_transport not in ('driving', 'need_ride', 'own_way') then
    raise exception 'Unsupported transport choice' using errcode = '22023';
  end if;
  if p_seats_available is not null and (p_transport is distinct from 'driving' or p_seats_available not between 0 and 8) then
    raise exception 'Seats only apply when driving, 0 to 8' using errcode = '22023';
  end if;

  select * into target from plans where id = p_plan_id;
  if target.id is null then
    raise exception 'That plan does not exist' using errcode = '22023';
  end if;

  -- The caller's one row, found by uid. A unique_violation on insert means a
  -- concurrent call won either key; the next pass re-reads and re-checks.
  -- Bounded, so a key collision the re-check cannot see fails instead of spinning.
  for attempt in 1..3 loop
    select * into existing from rsvps where plan_id = p_plan_id and user_id = caller for update;
    if exists (select 1 from rsvps r where r.plan_id = p_plan_id and r.voter_name = clean_name
               and r.user_id is distinct from caller) then
      raise exception 'That participant name is already in use' using errcode = '42501';
    end if;
    if existing.id is null then
      begin
        insert into rsvps (plan_id, voter_name, coming, choice, participant_token_hash, transport, seats_available, user_id)
        values (p_plan_id, clean_name, p_coming, p_choice, p_participant_token_hash, p_transport, p_seats_available, caller);
        return;
      exception when unique_violation then
      end;
    else
      update rsvps set voter_name = clean_name, coming = p_coming, choice = p_choice,
        participant_token_hash = p_participant_token_hash,
        transport = p_transport, seats_available = p_seats_available
        where id = existing.id;
      return;
    end if;
  end loop;
  raise exception 'Busy, try again' using errcode = '40001';
end; $$;

create or replace function rate_plan(
  p_plan_id uuid, p_spot_id uuid, p_voter_name text, p_stars integer, p_again boolean, p_participant_token_hash text
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing ratings%rowtype;
  target plans%rowtype;
  clean_name text := clean_display_name(p_voter_name);
  caller uuid := auth.uid();
begin
  -- 064: a permanent account is the price of taking part.
  if not is_permanent_user() then
    raise exception 'Sign in to rate this plan' using errcode = '42501';
  end if;
  if caller is null or p_participant_token_hash is null
     or p_participant_token_hash !~ '^[0-9a-f]{64}$'
     or p_stars is null or p_stars not between 1 and 5 then
    raise exception 'Participant authorization required' using errcode = '42501';
  end if;
  if exists (
    select 1 from ratings r
    where r.plan_id = p_plan_id and r.participant_token_hash = p_participant_token_hash
      and r.user_id is distinct from caller
  ) then
    raise exception 'That participant identity belongs to someone else' using errcode = '42501';
  end if;
  if clean_name = '' then
    raise exception 'Enter a name before rating' using errcode = '22023';
  end if;

  select * into target from plans where id = p_plan_id;
  if target.id is null or target.status <> 'decided' then
    raise exception 'This plan has not been decided yet' using errcode = '22023';
  end if;
  if target.winner_spot_id is null or target.winner_spot_id <> p_spot_id then
    raise exception 'You can only rate the place the group chose' using errcode = '22023';
  end if;

  for attempt in 1..3 loop
    select * into existing from ratings where plan_id = p_plan_id and user_id = caller for update;
    if exists (select 1 from ratings r where r.plan_id = p_plan_id and r.voter_name = clean_name
               and r.user_id is distinct from caller) then
      raise exception 'That participant name is already in use' using errcode = '42501';
    end if;
    if existing.id is null then
      begin
        insert into ratings (plan_id, spot_id, voter_name, stars, again, participant_token_hash, user_id)
        values (p_plan_id, p_spot_id, clean_name, p_stars, p_again, p_participant_token_hash, caller);
        return;
      exception when unique_violation then
      end;
    else
      update ratings set voter_name = clean_name, spot_id = p_spot_id, stars = p_stars, again = p_again,
        participant_token_hash = p_participant_token_hash
        where id = existing.id;
      return;
    end if;
  end loop;
  raise exception 'Busy, try again' using errcode = '40001';
end; $$;

create or replace function unrate_plan(p_plan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  removed int;
begin
  -- 064: a permanent account is the price of taking part.
  if not is_permanent_user() then
    raise exception 'Sign in to change your rating' using errcode = '42501';
  end if;
  if auth.uid() is null then
    raise exception 'Participant authorization required' using errcode = '42501';
  end if;
  delete from ratings where plan_id = p_plan_id and user_id = auth.uid();
  get diagnostics removed = row_count;
  return jsonb_build_object('result', case when removed > 0 then 'removed' else 'not_rated' end);
end;
$$;

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
  -- 064: a permanent account is the price of taking part.
  if not is_permanent_user() then
    raise exception 'Sign in to leave this plan' using errcode = '42501';
  end if;
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

-- Who can call these: permanent signed-in accounts. The grant stays
-- `authenticated` (anonymous sessions carry that role too); the guard above
-- is what refuses them, with a readable 42501.
revoke all on function claim_plan_access(uuid) from public, anon, authenticated;
revoke all on function cast_plan_vote(uuid, uuid, text, boolean, text, smallint, text) from public, anon, authenticated;
revoke all on function set_plan_rsvp(uuid, text, boolean, text, text, text, smallint) from public, anon, authenticated;
revoke all on function rate_plan(uuid, uuid, text, integer, boolean, text) from public, anon, authenticated;
revoke all on function unrate_plan(uuid) from public, anon, authenticated;
revoke all on function leave_plan(uuid) from public, anon, authenticated;
grant execute on function claim_plan_access(uuid) to authenticated;
grant execute on function cast_plan_vote(uuid, uuid, text, boolean, text, smallint, text) to authenticated;
grant execute on function set_plan_rsvp(uuid, text, boolean, text, text, text, smallint) to authenticated;
grant execute on function rate_plan(uuid, uuid, text, integer, boolean, text) to authenticated;
grant execute on function unrate_plan(uuid) to authenticated;
grant execute on function leave_plan(uuid) to authenticated;

-- ── 2. Plan reads need a permanent account ────────────────────────────────
-- Who can now read: a permanent session with a plan_access row for that plan
-- (or, for plans, its creator). Anonymous sessions read nothing plan-scoped.
alter policy "read own plan access" on plan_access
  using ((select is_permanent_user()) and user_id = (select auth.uid()));

alter policy "read accessible plans" on plans using (
  (select is_permanent_user()) and (
    created_by_user_id = (select auth.uid()) or exists (
      select 1 from plan_access a where a.plan_id = plans.id and a.user_id = (select auth.uid())
    )
  )
);
alter policy "read accessible plan spots" on plan_spots using (
  (select is_permanent_user()) and exists (
    select 1 from plan_access a where a.plan_id = plan_spots.plan_id and a.user_id = (select auth.uid()))
);
alter policy "read accessible votes" on votes using (
  (select is_permanent_user()) and exists (
    select 1 from plan_access a where a.plan_id = votes.plan_id and a.user_id = (select auth.uid()))
);
alter policy "read accessible rsvps" on rsvps using (
  (select is_permanent_user()) and exists (
    select 1 from plan_access a where a.plan_id = rsvps.plan_id and a.user_id = (select auth.uid()))
);
alter policy "read accessible ratings" on ratings using (
  (select is_permanent_user()) and exists (
    select 1 from plan_access a where a.plan_id = ratings.plan_id and a.user_id = (select auth.uid()))
);

-- Who: any session still reads curated, community and its own spots; only a
-- permanent plan member additionally reads a custom spot through a plan.
alter policy "read permitted spots" on spots using (
  source = 'curated'
  or visibility = 'community'
  or created_by_user_id = (select auth.uid())
  or ((select is_permanent_user()) and exists (
    select 1 from plan_spots ps
    join plan_access a on a.plan_id = ps.plan_id
    where ps.spot_id = spots.id and a.user_id = (select auth.uid())
  ))
);

-- Who: permanent plan members receive/send presence on plan:<uuid>:presence.
alter policy "plan members receive presence" on realtime.messages using (
  realtime.messages.extension = 'presence'
  and (select realtime.topic()) ~ '^plan:[0-9a-f-]{36}:presence$'
  and (select public.is_permanent_user())
  and exists(select 1 from public.plan_access a where a.user_id=(select auth.uid())
    and a.plan_id=split_part((select realtime.topic()),':',2)::uuid)
);
alter policy "plan members send presence" on realtime.messages with check (
  realtime.messages.extension = 'presence'
  and (select realtime.topic()) ~ '^plan:[0-9a-f-]{36}:presence$'
  and (select public.is_permanent_user())
  and exists(select 1 from public.plan_access a where a.user_id=(select auth.uid())
    and a.plan_id=split_part((select realtime.topic()),':',2)::uuid)
);
