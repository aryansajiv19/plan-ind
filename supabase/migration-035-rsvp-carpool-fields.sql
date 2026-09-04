-- Migration 035 — carpool coordination fields on rsvps.
-- Apply after migration 034. Additive (new columns + a superseding
-- create-or-replace of set_plan_rsvp), re-run safe.
--
-- design-system/SPECS.md §10.2, owner-approved as originally scoped: a
-- coordination LIST, not a matcher. "Who's driving with open seats, who
-- needs a ride, who's making their own way" on the payoff screen. The app
-- does not assign riders to drivers -- no route optimization, no capacity
-- enforcement beyond the two columns below, that's a group-chat decision.
--
-- Reuses the existing rsvps table and its existing write path
-- (set_plan_rsvp) rather than a new table or a new RPC: this is two more
-- fields on the same one-row-per-(plan,voter) record RSVPs already are.
-- rsvps still has no direct write policy -- this RPC is still the only way
-- in, same posture as before.

alter table rsvps add column if not exists transport text
  check (transport in ('driving', 'need_ride', 'own_way'));
alter table rsvps add column if not exists seats_available smallint
  check (seats_available is null or seats_available between 0 and 8);
-- "meaningful only when transport = 'driving'" isn't just a UI convention --
-- enforced so an inconsistent row (a seat count with no driving answer)
-- can never exist to begin with.
alter table rsvps add constraint rsvps_seats_only_when_driving
  check (seats_available is null or transport = 'driving');

-- `create or replace` only replaces a function with the IDENTICAL parameter
-- signature -- adding two parameters (even with defaults) makes Postgres
-- create a second, overloaded function alongside the old 5-arg one instead
-- of replacing it, unless the old one is dropped first. Same lesson 023
-- already hit for a return-type change; this is the arity-change version of
-- the same pitfall. `drop` resets the ACL, hence the revoke/grant restated
-- below regardless.
drop function if exists set_plan_rsvp(uuid, text, boolean, text, text);

create function set_plan_rsvp(
  p_plan_id uuid, p_voter_name text, p_coming boolean, p_choice text, p_participant_token_hash text,
  p_transport text default null, p_seats_available smallint default null
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
  if p_transport is not null and p_transport not in ('driving', 'need_ride', 'own_way') then
    raise exception 'Unsupported transport choice' using errcode = '22023';
  end if;
  if p_seats_available is not null and (p_transport is distinct from 'driving' or p_seats_available not between 0 and 8) then
    raise exception 'Seats only apply when driving, 0 to 8' using errcode = '22023';
  end if;

  -- RSVPs stay open after the plan is decided: that is when most people
  -- answer. Only a plan that exists is required.
  select * into target from plans where id = p_plan_id;
  if target.id is null then
    raise exception 'That plan does not exist' using errcode = '22023';
  end if;

  loop
    select * into existing from rsvps where plan_id = p_plan_id and voter_name = clean_name for update;
    if existing.id is not null and existing.participant_token_hash is not null
       and existing.participant_token_hash <> p_participant_token_hash then
      raise exception 'That participant name is already in use' using errcode = '42501';
    end if;
    if existing.id is null then
      begin
        insert into rsvps (plan_id, voter_name, coming, choice, participant_token_hash, transport, seats_available)
        values (p_plan_id, clean_name, p_coming, p_choice, p_participant_token_hash, p_transport, p_seats_available);
        return;
      exception when unique_violation then
        -- a concurrent first-time RSVP for this name just committed; loop
        -- back and take the update branch against the row it created.
      end;
    else
      update rsvps set coming = p_coming, choice = p_choice, participant_token_hash = p_participant_token_hash,
        transport = p_transport, seats_available = p_seats_available
        where id = existing.id;
      return;
    end if;
  end loop;
end; $$;

-- `create or replace function` preserves the ACL, but restate it anyway --
-- the standing rule after 021/024 both had to clean up a case where that
-- assumption was wrong.
revoke all on function set_plan_rsvp(uuid, text, boolean, text, text, text, smallint) from public, anon;
grant execute on function set_plan_rsvp(uuid, text, boolean, text, text, text, smallint) to authenticated;
