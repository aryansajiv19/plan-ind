-- Migration 067: host and ballot identity. STAGED -- written, not applied
-- anywhere. Applies after 064 and ships with the go-live deploy (the client
-- side of B7/R1/R6 is Session A's). Security review 2026-09-26, findings file
-- items B7, R14, R1, R7, R2/R13, R8, R6. Every body below is the latest one
-- (050 / 055 / 057 / 047 / 064) copied verbatim, then edited where marked 067.
--
-- Host (B7 + R14): plan_host_authorized() is the single rule for
-- execute_plan_command, edit_plan, reopen_plan and delete_plan -- a permanent
-- account that created the plan, on any device; the host token counts only
-- for a legacy plan with no recorded creator. execute_plan_command had no
-- creator binding at all (R14). Note the one widening: a legacy creator-less
-- plan can now be edited/reopened/deleted by its token holder (those three
-- used to refuse creator-less plans outright). am_plan_host(uuid) lets the
-- page show host controls on any device.
--
-- Rounds (R1): 'advance' gives the final round at least an hour; 'decide'
-- breaks final ties by pool-round votes, then round order -- never the uuid.
--
-- Ballots (R2/R13, R7): the participant_token_hash ownership checks go (any
-- co-member can read a hash and squat it), with the unique index that keyed on
-- it; identity is auth.uid(). cast_plan_vote refuses a name another account
-- already uses in the plan, as set_plan_rsvp and rate_plan do.
--
-- booking_owner (R8) goes through clean_app_text like every other shown text.
--
-- Joining (R6, owner decision): claim_plan_access applies the plan's age gate
-- (category + every dealt spot, via category_min_age/spot_required_age and
-- current_member_age). Existing plan_access rows are kept; reads through them
-- are unchanged, but the page's claim call now stops an under-age member.
--
-- Every function is create or replace (same signatures), and each re-states
-- revoke from public, anon, authenticated + grant to authenticated.

-- The one host rule. A permanent account is required. It is the host when it
-- created the plan, on any device, with or without a token (B7). The host
-- token counts ONLY for a legacy plan with no recorded creator, so a token
-- left in a shared browser gives another account nothing (R14).
create or replace function plan_host_authorized(p_plan_id uuid, p_host_token text)
returns boolean language sql stable set search_path = public, extensions, pg_temp as $$
  select is_permanent_user() and exists (
    select 1 from plans p
    where p.id = p_plan_id and (
      p.created_by_user_id = auth.uid()
      or (p.created_by_user_id is null
          and p_host_token is not null and length(p_host_token) >= 32
          and exists (select 1 from plan_host_tokens t
                      where t.plan_id = p.id
                        and t.token_hash = encode(digest(p_host_token, 'sha256'), 'hex')))))
$$;
-- Internal: only the definer functions below call it.
revoke all on function plan_host_authorized(uuid, text) from public, anon, authenticated;

-- For the page: show host controls on any device the creator signs in on.
-- Legacy (creator-less) plans answer false; the client falls back to its token.
create or replace function am_plan_host(p_plan_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select is_permanent_user()
     and exists (select 1 from plans where id = p_plan_id and created_by_user_id = auth.uid())
$$;
revoke all on function am_plan_host(uuid) from public, anon, authenticated;
grant execute on function am_plan_host(uuid) to authenticated;

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
  winner uuid;
begin
  select * into target from plans where id = p_plan_id for update;
  -- 067 (B7/R14): the one host rule (plan_host_authorized). It had no
  -- creator binding before, so a leftover token worked for any account.
  if target.id is null or not plan_host_authorized(p_plan_id, p_host_token) then
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
    -- 067 (R1): the final round gets real time to vote; advancing at the
    -- deadline used to leave it none. A plan with no deadline keeps none.
    update plans set stage = 'final',
      deadline = case when deadline is null then null else greatest(deadline, now() + interval '1 hour') end
    where id = p_plan_id;

  elsif p_command = 'decide' then
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

create or replace function edit_plan(
  p_plan_id uuid,
  p_host_token text,
  p_title text default null,
  p_deadline timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  target plans%rowtype;
  new_title text;
begin
  if auth.uid() is null or coalesce(auth.jwt()->>'is_anonymous', 'false') = 'true' then
    raise exception 'Sign in required' using errcode = '42501';
  end if;

  select * into target from plans where id = p_plan_id for update;
  if target.id is null then
    return jsonb_build_object('result', 'not_found');
  end if;

  -- 067: the one host rule (plan_host_authorized).
  if not plan_host_authorized(p_plan_id, p_host_token) then
    return jsonb_build_object('result', 'not_host');
  end if;

  if target.status <> 'open' or target.stage <> 'pool'
     or exists (select 1 from votes where plan_id = p_plan_id) then
    return jsonb_build_object('result', 'voting_started');
  end if;

  if p_title is not null then
    new_title := clean_app_text(p_title, 60);
    if new_title = '' or clean_display_name(new_title) = '' then
      return jsonb_build_object('result', 'invalid_title');
    end if;
  end if;

  if p_deadline is not null and (p_deadline <= now() or p_deadline > now() + interval '1 year') then
    return jsonb_build_object('result', 'invalid_deadline');
  end if;

  if (new_title is null or new_title = target.title)
     and (p_deadline is null or p_deadline = target.deadline) then
    return jsonb_build_object('result', 'nothing_to_change');
  end if;

  update plans set
    title = coalesce(new_title, title),
    deadline = coalesce(p_deadline, deadline)
  where id = p_plan_id
  returning * into target;

  return jsonb_build_object('result', 'edited', 'title', target.title, 'deadline', target.deadline);
end;
$$;
revoke all on function edit_plan(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function edit_plan(uuid, text, text, timestamptz) to authenticated;

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
begin
  if auth.uid() is null or coalesce(auth.jwt()->>'is_anonymous', 'false') = 'true' then
    raise exception 'Sign in required' using errcode = '42501';
  end if;

  select * into target from plans where id = p_plan_id for update;
  if target.id is null then
    return jsonb_build_object('result', 'not_found');
  end if;

  -- 067: the one host rule (plan_host_authorized).
  if not plan_host_authorized(p_plan_id, p_host_token) then
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
    deadline = p_deadline,
    reopened_at = now()
  where id = p_plan_id;

  insert into security_events (event_type, outcome, actor_user_id, metadata)
  values ('plan_command', 'success', auth.uid(),
    jsonb_build_object('command', 'reopen', 'plan_id', p_plan_id));

  return jsonb_build_object('result', 'reopened', 'deadline', p_deadline);
end;
$$;
revoke all on function reopen_plan(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function reopen_plan(uuid, text, timestamptz) to authenticated;

create or replace function delete_plan(p_plan_id uuid, p_host_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  target plans%rowtype;
  participants int;
begin
  -- Same permanent-account gate as create_secure_plan: the route refuses
  -- anonymous sessions, and this holds for a direct PostgREST call too.
  if auth.uid() is null or coalesce(auth.jwt()->>'is_anonymous', 'false') = 'true' then
    raise exception 'Sign in required' using errcode = '42501';
  end if;

  select * into target from plans where id = p_plan_id for update;
  if target.id is null then
    return jsonb_build_object('result', 'not_found');
  end if;

  -- 067: the one host rule (plan_host_authorized).
  if not plan_host_authorized(p_plan_id, p_host_token) then
    return jsonb_build_object('result', 'not_host');
  end if;

  if target.status <> 'open' then
    return jsonb_build_object('result', 'already_decided');
  end if;

  select count(distinct who) into participants from (
    select coalesce(user_id::text, participant_token_hash, voter_name) as who from votes where plan_id = p_plan_id
    union
    select coalesce(user_id::text, participant_token_hash, voter_name) from rsvps where plan_id = p_plan_id
  ) p;

  delete from plans where id = p_plan_id;

  insert into security_events (event_type, outcome, actor_user_id, metadata)
  values ('plan_command', 'success', auth.uid(),
    jsonb_build_object('command', 'delete', 'plan_id', p_plan_id, 'participants', participants));

  return jsonb_build_object('result', 'deleted', 'participants', participants);
end;
$$;
revoke all on function delete_plan(uuid, text) from public, anon, authenticated;
grant execute on function delete_plan(uuid, text) to authenticated;

-- 067 (R2/R13): the hash was the only thing this unique index keyed on; a
-- squatted row here still blocked the victim's own vote. One vote per account
-- per round stays enforced by votes_user_round_key (061).
drop index if exists votes_participant_round_key;

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
  -- 067 (R2/R13): no hash-ownership check; identity is auth.uid().
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
    -- 067 (R7): a name is one member's, as set_plan_rsvp and rate_plan enforce.
    if exists (select 1 from votes v where v.plan_id = p_plan_id and v.voter_name = clean_name
               and v.user_id is distinct from caller) then
      raise exception 'That participant name is already in use' using errcode = '42501';
    end if;
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
revoke all on function cast_plan_vote(uuid, uuid, text, boolean, text, smallint, text) from public, anon, authenticated;
grant execute on function cast_plan_vote(uuid, uuid, text, boolean, text, smallint, text) to authenticated;

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
  -- 067 (R2/R13): no hash-ownership check; identity is auth.uid().
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
revoke all on function set_plan_rsvp(uuid, text, boolean, text, text, text, smallint) from public, anon, authenticated;
grant execute on function set_plan_rsvp(uuid, text, boolean, text, text, text, smallint) to authenticated;

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
  -- 067 (R2/R13): no hash-ownership check; identity is auth.uid().
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
revoke all on function rate_plan(uuid, uuid, text, integer, boolean, text) from public, anon, authenticated;
grant execute on function rate_plan(uuid, uuid, text, integer, boolean, text) to authenticated;

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
  if not exists (select 1 from plans where id = p_plan_id) then return false; end if;
  -- 067 (R6): a joiner meets the same age gate the host met at creation: the
  -- plan's category and every dealt spot. Raised, not false (false means no
  -- such plan); the messages are shown verbatim.
  select greatest(category_min_age(p.category), coalesce(max(spot_required_age(s.category, s.minimum_age)), 0))
    into required_age
    from plans p
    left join plan_spots ps on ps.plan_id = p.id
    left join spots s on s.id = ps.spot_id
    where p.id = p_plan_id
    group by p.category;
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
