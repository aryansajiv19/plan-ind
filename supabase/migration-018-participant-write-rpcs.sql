-- Enforce participant-token ownership for new shared-plan writes.
drop policy if exists "cast votes" on votes;
drop policy if exists "change votes" on votes;
drop policy if exists "clear votes" on votes;
drop policy if exists "cast rsvps" on rsvps;
drop policy if exists "change rsvps" on rsvps;
drop policy if exists "cast ratings" on ratings;
drop policy if exists "change ratings" on ratings;

create or replace function cast_plan_vote(
  p_plan_id uuid, p_spot_id uuid, p_voter_name text, p_value boolean,
  p_phase text, p_pool_number smallint, p_participant_token_hash text
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_participant_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'Participant authorization required' using errcode = '42501'; end if;
  delete from votes where plan_id = p_plan_id and participant_token_hash = p_participant_token_hash and phase = p_phase and pool_number = p_pool_number;
  if p_value then
    insert into votes (plan_id, spot_id, voter_name, value, phase, pool_number, participant_token_hash)
    values (p_plan_id, p_spot_id, left(trim(p_voter_name), 40), true, p_phase, p_pool_number, p_participant_token_hash);
  end if;
end; $$;

create or replace function set_plan_rsvp(
  p_plan_id uuid, p_voter_name text, p_coming boolean, p_choice text, p_participant_token_hash text
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare existing rsvps%rowtype;
begin
  if p_participant_token_hash !~ '^[0-9a-f]{64}$' or p_choice not in ('coming', 'maybe', 'no') then raise exception 'Participant authorization required' using errcode = '42501'; end if;
  select * into existing from rsvps where plan_id = p_plan_id and voter_name = left(trim(p_voter_name), 40) for update;
  if existing.id is not null and existing.participant_token_hash is not null and existing.participant_token_hash <> p_participant_token_hash then raise exception 'That participant name is already in use' using errcode = '42501'; end if;
  if existing.id is null then
    insert into rsvps (plan_id, voter_name, coming, choice, participant_token_hash) values (p_plan_id, left(trim(p_voter_name), 40), p_coming, p_choice, p_participant_token_hash);
  else
    update rsvps set coming = p_coming, choice = p_choice, participant_token_hash = p_participant_token_hash where id = existing.id;
  end if;
end; $$;

create or replace function rate_plan(
  p_plan_id uuid, p_spot_id uuid, p_voter_name text, p_stars integer, p_again boolean, p_participant_token_hash text
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare existing ratings%rowtype;
begin
  if p_participant_token_hash !~ '^[0-9a-f]{64}$' or p_stars not between 1 and 5 then raise exception 'Participant authorization required' using errcode = '42501'; end if;
  select * into existing from ratings where plan_id = p_plan_id and voter_name = left(trim(p_voter_name), 40) for update;
  if existing.id is not null and existing.participant_token_hash is not null and existing.participant_token_hash <> p_participant_token_hash then raise exception 'That participant name is already in use' using errcode = '42501'; end if;
  if existing.id is null then
    insert into ratings (plan_id, spot_id, voter_name, stars, again, participant_token_hash) values (p_plan_id, p_spot_id, left(trim(p_voter_name), 40), p_stars, p_again, p_participant_token_hash);
  else
    update ratings set spot_id = p_spot_id, stars = p_stars, again = p_again, participant_token_hash = p_participant_token_hash where id = existing.id;
  end if;
end; $$;

revoke all on function cast_plan_vote(uuid, uuid, text, boolean, text, smallint, text) from public;
revoke all on function set_plan_rsvp(uuid, text, boolean, text, text) from public;
revoke all on function rate_plan(uuid, uuid, text, integer, boolean, text) from public;
grant execute on function cast_plan_vote(uuid, uuid, text, boolean, text, smallint, text) to anon, authenticated;
grant execute on function set_plan_rsvp(uuid, text, boolean, text, text) to anon, authenticated;
grant execute on function rate_plan(uuid, uuid, text, integer, boolean, text) to anon, authenticated;
