-- Migration 043: bind participant identity to auth.uid().
--
-- ── The vulnerability ────────────────────────────────────────────────────
--
-- `participant_token_hash` was treated as an identity marker, but it
-- functioned as a BEARER TOKEN that every co-member could read. The RPCs
-- validated only that it was 64 hex characters -- never that it belonged to
-- the caller -- and `read accessible votes` returns the whole row, hash
-- included, to every member of the plan. Hashing bought nothing: the server
-- compares a submitted hash against a stored hash that the submitter can
-- read. It is pass-the-hash.
--
-- The chain needs only the public anon key and a forwarded share link:
--   anonymous sign-in -> claim_plan_access (membership to anyone who knows
--   the plan id) -> select * from votes to read every member's hash ->
--   cast_plan_vote with the victim's hash and the attacker's own spot. The
--   unique key turns that into DO UPDATE, so the victim's vote MOVES rather
--   than erroring, and `p_value := false` deletes it outright. Realtime then
--   pushes the rewritten row to the victim's own screen.
--
-- None of it touches an app route, so the CSRF and Origin checks are not in
-- the path. In product terms: anyone the link is forwarded to can decide
-- where the group eats, and the friend sees a choice they never made. That
-- is the app's core promise inverted, and it was never a recorded tradeoff --
-- the seam is documented as an identity mechanism, never as a credential.
--
-- ── What this migration does, and what it deliberately defers ────────────
--
-- Adds `user_id` to votes/rsvps/ratings, written by the RPCs from
-- `auth.uid()` rather than from any argument, and refuses a write whose
-- target row is already owned by a different user. `auth.uid()` is the one
-- value in this exchange the caller cannot choose: it comes from the signed
-- JWT, and it is available inside a security-definer function (definer
-- changes the privilege context, not the token claims). Anonymous guests
-- have a real uid too, so the guest path keeps working unchanged.
--
-- NOT done here, on purpose: moving the unique key to
-- `(plan_id, user_id, phase, pool_number)`. That is the complete fix -- it
-- would also stop one user voting repeatedly under several self-minted
-- hashes -- but it means rewriting cast_plan_vote's ON CONFLICT target and
-- backfilling a column that CANNOT be backfilled: existing rows record only
-- a hash, and which user cast them is not recoverable. Doing that under time
-- pressure on live data is how a fix becomes an outage. This migration
-- closes the exploit for every new write; the key change should follow as
-- its own reviewed step.
--
-- Legacy rows have `user_id is null` and are claimable by the first writer
-- that presents their hash. That is a deliberate, narrow residue: those rows
-- predate the column and there is no honest way to attribute them.

alter table public.votes   add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.rsvps   add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.ratings add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists votes_user_idx   on public.votes (plan_id, user_id);
create index if not exists rsvps_user_idx   on public.rsvps (plan_id, user_id);
create index if not exists ratings_user_idx on public.ratings (plan_id, user_id);

-- ── cast_plan_vote ───────────────────────────────────────────────────────
create or replace function cast_plan_vote(
  p_plan_id uuid, p_spot_id uuid, p_voter_name text, p_value boolean,
  p_phase text, p_pool_number smallint, p_participant_token_hash text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target plans%rowtype;
  clean_name text := left(trim(p_voter_name), 40);
  caller uuid := auth.uid();
begin
  if p_participant_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Participant authorization required' using errcode = '42501';
  end if;
  if caller is null then
    raise exception 'Participant authorization required' using errcode = '42501';
  end if;
  -- 043: the hash is not a credential. Refuse to touch a row that already
  -- belongs to somebody else, whatever hash was presented.
  if exists (
    select 1 from votes v
    where v.plan_id = p_plan_id and v.participant_token_hash = p_participant_token_hash
      and v.user_id is not null and v.user_id <> caller
  ) then
    raise exception 'That participant identity belongs to someone else' using errcode = '42501';
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
    on conflict (plan_id, participant_token_hash, phase, pool_number)
      where participant_token_hash is not null
      do update set spot_id = excluded.spot_id, voter_name = excluded.voter_name,
                    value = true, user_id = caller;
  else
    -- Ownership is re-checked here too: the guard above only sees rows that
    -- already carry a user_id, and delete must not become the soft spot.
    delete from votes
      where plan_id = p_plan_id and participant_token_hash = p_participant_token_hash
        and phase = p_phase and pool_number = p_pool_number
        and (user_id is null or user_id = caller);
  end if;

  return jsonb_build_object(
    'plan_id',     p_plan_id,
    'phase',       p_phase,
    'pool_number', p_pool_number,
    'spot_id',     case when p_value then p_spot_id else null end
  );
end; $$;

-- ── set_plan_rsvp ────────────────────────────────────────────────────────
create or replace function set_plan_rsvp(
  p_plan_id uuid, p_voter_name text, p_coming boolean, p_choice text, p_participant_token_hash text,
  p_transport text default null, p_seats_available smallint default null
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing rsvps%rowtype;
  target plans%rowtype;
  clean_name text := left(trim(p_voter_name), 40);
  caller uuid := auth.uid();
begin
  if p_participant_token_hash !~ '^[0-9a-f]{64}$'
     or p_choice is null or p_choice not in ('coming', 'maybe', 'no') then
    raise exception 'Participant authorization required' using errcode = '42501';
  end if;
  if caller is null then
    raise exception 'Participant authorization required' using errcode = '42501';
  end if;
  if exists (
    select 1 from rsvps r
    where r.plan_id = p_plan_id and r.participant_token_hash = p_participant_token_hash
      and r.user_id is not null and r.user_id <> caller
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

  loop
    select * into existing from rsvps where plan_id = p_plan_id and voter_name = clean_name for update;
    if existing.id is not null and existing.user_id is not null and existing.user_id <> caller then
      raise exception 'That participant name is already in use' using errcode = '42501';
    end if;
    if existing.id is not null and existing.participant_token_hash is not null
       and existing.participant_token_hash <> p_participant_token_hash then
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
      update rsvps set coming = p_coming, choice = p_choice, participant_token_hash = p_participant_token_hash,
        transport = p_transport, seats_available = p_seats_available, user_id = caller
        where id = existing.id;
      return;
    end if;
  end loop;
end; $$;

-- ── rate_plan ────────────────────────────────────────────────────────────
create or replace function rate_plan(
  p_plan_id uuid, p_spot_id uuid, p_voter_name text, p_stars integer, p_again boolean, p_participant_token_hash text
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing ratings%rowtype;
  target plans%rowtype;
  clean_name text := left(trim(p_voter_name), 40);
  caller uuid := auth.uid();
begin
  if p_participant_token_hash !~ '^[0-9a-f]{64}$' or p_stars not between 1 and 5 then
    raise exception 'Participant authorization required' using errcode = '42501';
  end if;
  if caller is null then
    raise exception 'Participant authorization required' using errcode = '42501';
  end if;
  if exists (
    select 1 from ratings r
    where r.plan_id = p_plan_id and r.participant_token_hash = p_participant_token_hash
      and r.user_id is not null and r.user_id <> caller
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

  loop
    select * into existing from ratings where plan_id = p_plan_id and voter_name = clean_name for update;
    if existing.id is not null and existing.user_id is not null and existing.user_id <> caller then
      raise exception 'That participant name is already in use' using errcode = '42501';
    end if;
    if existing.id is not null and existing.participant_token_hash is not null
       and existing.participant_token_hash <> p_participant_token_hash then
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
      update ratings set spot_id = p_spot_id, stars = p_stars, again = p_again,
        participant_token_hash = p_participant_token_hash, user_id = caller where id = existing.id;
      return;
    end if;
  end loop;
end; $$;

-- create or replace preserves the ACL, so 020/021's grants still stand.
