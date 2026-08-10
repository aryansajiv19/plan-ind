-- Apply after migration 018.
--
-- Three fixes, all of the same shape: a secret or a rule that lived somewhere
-- the client could reach it moves behind a boundary the client cannot cross.
--
--   1. plans.host_token_hash  -> plan_host_tokens  (write-only to clients)
--   2. participant RPCs       -> relational + state validation
--   3. auth user_metadata DOB -> member_ages       (server-owned, immutable)

-- ── 1. Host token hash leaves the publicly readable plans row ─────────────
--
-- "read plans" is `using (true)`, so every column of plans is visible to
-- anyone holding a share link, and realtime broadcasts the whole row on
-- every UPDATE. Patching each projection would leave the next `select("*")`
-- to reintroduce the leak, so the secret moves to its own table instead.

create table if not exists plan_host_tokens (
  plan_id    uuid primary key references plans (id) on delete cascade,
  token_hash text not null,
  created_at timestamptz not null default now()
);

alter table plan_host_tokens enable row level security;

-- Insert only, and only for a plan you own. There is deliberately no select,
-- update or delete policy: once written, the hash is unreadable through
-- PostgREST by any role. Only security-definer functions can see it.
drop policy if exists "attach host token" on plan_host_tokens;
create policy "attach host token" on plan_host_tokens for insert to authenticated
  with check (exists (
    select 1 from plans p
    where p.id = plan_id and p.created_by_user_id = (select auth.uid())
  ));

insert into plan_host_tokens (plan_id, token_hash)
  select id, host_token_hash from plans where host_token_hash is not null
  on conflict (plan_id) do nothing;

alter table plans drop column if exists host_token_hash;

-- Rewritten to read the hash from its new home. The tally, tie-break and
-- command semantics are unchanged from migration 015.
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
  stored_hash text;
  finalists uuid[] := '{}';
  winner uuid;
begin
  if p_host_token is null or length(p_host_token) < 32 then
    raise exception 'Invalid host token' using errcode = '42501';
  end if;

  select * into target from plans where id = p_plan_id for update;
  select token_hash into stored_hash from plan_host_tokens where plan_id = p_plan_id;
  if target.id is null or stored_hash is null
     or stored_hash <> encode(digest(p_host_token, 'sha256'), 'hex') then
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
    update plans set stage = 'final' where id = p_plan_id;

  elsif p_command = 'decide' then
    if target.status <> 'open' or target.stage <> 'final' then
      raise exception 'This plan is not ready to decide';
    end if;

    with ranked as (
      select ps.spot_id, count(v.id) filter (where v.value) as yes_count
      from plan_spots ps
      left join votes v on v.plan_id = ps.plan_id
        and v.spot_id = ps.spot_id
        and v.phase = 'final'
        and v.pool_number = 0
      where ps.plan_id = p_plan_id and ps.advanced
      group by ps.spot_id
    )
    select spot_id into winner from ranked order by yes_count desc, spot_id limit 1;
    if winner is null then raise exception 'The final shortlist needs a vote'; end if;
    update plans set status = 'decided', stage = 'decided', winner_spot_id = winner where id = p_plan_id;

  elsif p_command = 'patch' then
    update plans set
      event_time = case when p_patch ? 'event_time' then nullif(p_patch->>'event_time', '')::timestamptz else event_time end,
      booking_owner = case when p_patch ? 'booking_owner' then nullif(left(p_patch->>'booking_owner', 80), '') else booking_owner end,
      booked = case when p_patch ? 'booked' then (p_patch->>'booked')::boolean else booked end
    where id = p_plan_id;
  else
    raise exception 'Unsupported plan command';
  end if;

  select * into target from plans where id = p_plan_id;
  return jsonb_build_object('plan', to_jsonb(target), 'winner_spot_id', target.winner_spot_id, 'finalists', finalists);
end;
$$;

revoke all on function execute_plan_command(uuid, text, text, jsonb) from public;
grant execute on function execute_plan_command(uuid, text, text, jsonb) to anon, authenticated;

-- ── 2. Participant RPCs get relational and state validation ───────────────
--
-- Migration 018 checked the token-hash shape and nothing else: none of the
-- three functions read plans at all. A caller could vote on a spot belonging
-- to a different plan, vote after the plan was decided, rate a losing venue,
-- or register under an empty name. The token hash is a client-supplied
-- identity claim, so it was the only thing standing in the way.

create or replace function cast_plan_vote(
  p_plan_id uuid, p_spot_id uuid, p_voter_name text, p_value boolean,
  p_phase text, p_pool_number smallint, p_participant_token_hash text
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target plans%rowtype;
  clean_name text := left(trim(p_voter_name), 40);
begin
  if p_participant_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Participant authorization required' using errcode = '42501';
  end if;
  if clean_name = '' then
    raise exception 'Enter a name before voting' using errcode = '22023';
  end if;
  if p_phase not in ('pool', 'final') then
    raise exception 'Unsupported voting phase' using errcode = '22023';
  end if;

  select * into target from plans where id = p_plan_id;
  if target.id is null or target.status <> 'open' then
    raise exception 'This plan is not open for voting' using errcode = '22023';
  end if;
  -- The stage gates the phase: pool votes close once the finalists are set.
  if p_phase <> target.stage then
    raise exception 'This round is no longer open' using errcode = '22023';
  end if;
  if p_phase = 'pool' and (p_pool_number < 1 or p_pool_number > target.pool_count) then
    raise exception 'That round does not exist' using errcode = '22023';
  end if;
  if p_phase = 'final' and p_pool_number <> 0 then
    raise exception 'That round does not exist' using errcode = '22023';
  end if;
  -- The spot must be a candidate on this plan, in this pool. In the final
  -- round it must additionally be one of the advanced finalists.
  if not exists (
    select 1 from plan_spots ps
    where ps.plan_id = p_plan_id and ps.spot_id = p_spot_id
      and (p_phase = 'final' or ps.pool_number = p_pool_number)
      and (p_phase = 'pool' or ps.advanced)
  ) then
    raise exception 'That place is not on this plan' using errcode = '22023';
  end if;

  delete from votes
    where plan_id = p_plan_id and participant_token_hash = p_participant_token_hash
      and phase = p_phase and pool_number = p_pool_number;
  if p_value then
    insert into votes (plan_id, spot_id, voter_name, value, phase, pool_number, participant_token_hash)
    values (p_plan_id, p_spot_id, clean_name, true, p_phase, p_pool_number, p_participant_token_hash);
  end if;
end; $$;

create or replace function set_plan_rsvp(
  p_plan_id uuid, p_voter_name text, p_coming boolean, p_choice text, p_participant_token_hash text
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing rsvps%rowtype;
  target plans%rowtype;
  clean_name text := left(trim(p_voter_name), 40);
begin
  if p_participant_token_hash !~ '^[0-9a-f]{64}$' or p_choice not in ('coming', 'maybe', 'no') then
    raise exception 'Participant authorization required' using errcode = '42501';
  end if;
  if clean_name = '' then
    raise exception 'Enter a name before replying' using errcode = '22023';
  end if;

  -- RSVPs stay open after the plan is decided: that is when most people
  -- answer. Only a plan that exists is required.
  select * into target from plans where id = p_plan_id;
  if target.id is null then
    raise exception 'That plan does not exist' using errcode = '22023';
  end if;

  select * into existing from rsvps where plan_id = p_plan_id and voter_name = clean_name for update;
  if existing.id is not null and existing.participant_token_hash is not null
     and existing.participant_token_hash <> p_participant_token_hash then
    raise exception 'That participant name is already in use' using errcode = '42501';
  end if;
  if existing.id is null then
    insert into rsvps (plan_id, voter_name, coming, choice, participant_token_hash)
    values (p_plan_id, clean_name, p_coming, p_choice, p_participant_token_hash);
  else
    update rsvps set coming = p_coming, choice = p_choice, participant_token_hash = p_participant_token_hash
      where id = existing.id;
  end if;
end; $$;

create or replace function rate_plan(
  p_plan_id uuid, p_spot_id uuid, p_voter_name text, p_stars integer, p_again boolean, p_participant_token_hash text
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing ratings%rowtype;
  target plans%rowtype;
  clean_name text := left(trim(p_voter_name), 40);
begin
  if p_participant_token_hash !~ '^[0-9a-f]{64}$' or p_stars not between 1 and 5 then
    raise exception 'Participant authorization required' using errcode = '42501';
  end if;
  if clean_name = '' then
    raise exception 'Enter a name before rating' using errcode = '22023';
  end if;

  -- You can only rate the place the group actually went to, and only once
  -- the plan has settled on it.
  select * into target from plans where id = p_plan_id;
  if target.id is null or target.status <> 'decided' then
    raise exception 'This plan has not been decided yet' using errcode = '22023';
  end if;
  if target.winner_spot_id is null or target.winner_spot_id <> p_spot_id then
    raise exception 'You can only rate the place the group chose' using errcode = '22023';
  end if;

  select * into existing from ratings where plan_id = p_plan_id and voter_name = clean_name for update;
  if existing.id is not null and existing.participant_token_hash is not null
     and existing.participant_token_hash <> p_participant_token_hash then
    raise exception 'That participant name is already in use' using errcode = '42501';
  end if;
  if existing.id is null then
    insert into ratings (plan_id, spot_id, voter_name, stars, again, participant_token_hash)
    values (p_plan_id, p_spot_id, clean_name, p_stars, p_again, p_participant_token_hash);
  else
    update ratings set spot_id = p_spot_id, stars = p_stars, again = p_again,
      participant_token_hash = p_participant_token_hash where id = existing.id;
  end if;
end; $$;

revoke all on function cast_plan_vote(uuid, uuid, text, boolean, text, smallint, text) from public;
revoke all on function set_plan_rsvp(uuid, text, boolean, text, text) from public;
revoke all on function rate_plan(uuid, uuid, text, integer, boolean, text) from public;
grant execute on function cast_plan_vote(uuid, uuid, text, boolean, text, smallint, text) to anon, authenticated;
grant execute on function set_plan_rsvp(uuid, text, boolean, text, text) to anon, authenticated;
grant execute on function rate_plan(uuid, uuid, text, integer, boolean, text) to anon, authenticated;

-- ── 3. Date of birth becomes server-owned and write-once ──────────────────
--
-- DOB lived in auth user_metadata, which any signed-in browser can rewrite
-- with supabase.auth.updateUser({ data }). The 13/18/21 gates read from it,
-- so the entire age policy was self-certified by the client. Guarding the
-- server action would not have helped: that is not the writable path.

create table if not exists member_ages (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  date_of_birth date not null,
  created_at    timestamptz not null default now()
);

alter table member_ages enable row level security;

-- Readable by its owner so the app can check its own eligibility. No insert
-- or update policy at all: the only write path is set_birth_date below.
drop policy if exists "read own age" on member_ages;
create policy "read own age" on member_ages for select to authenticated
  using (user_id = (select auth.uid()));

-- Carry over anyone who already completed onboarding, so this migration does
-- not send existing accounts back through the age form.
insert into member_ages (user_id, date_of_birth)
  select id, (raw_user_meta_data->>'date_of_birth')::date
  from auth.users
  where raw_user_meta_data->>'date_of_birth' ~ '^\d{4}-\d{2}-\d{2}$'
  on conflict (user_id) do nothing;

create or replace function set_birth_date(p_date_of_birth date)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  years integer;
begin
  if uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  -- Write-once. A second call is an age-escalation attempt, not an edit.
  if exists (select 1 from member_ages where user_id = uid) then
    raise exception 'Your date of birth is already on file' using errcode = '42501';
  end if;
  if p_date_of_birth is null or p_date_of_birth > current_date then
    raise exception 'Enter a real date of birth' using errcode = '22023';
  end if;
  years := extract(year from age(current_date, p_date_of_birth));
  if years < 13 then
    raise exception 'Deal three is for people 13 and older' using errcode = '22023';
  end if;
  if years > 120 then
    raise exception 'Enter a real date of birth' using errcode = '22023';
  end if;
  insert into member_ages (user_id, date_of_birth) values (uid, p_date_of_birth);
end; $$;

revoke all on function set_birth_date(date) from public;
grant execute on function set_birth_date(date) to authenticated;
