-- Migration 025 — close the same double-write race migration 023 closed on
-- votes, in set_plan_rsvp and rate_plan. Apply after 024. Re-run safe
-- (create or replace preserves the ACL; no schema objects added or removed).
--
-- Both functions do `select ... for update` then insert-if-absent /
-- update-if-present. That locks an EXISTING row, but locks nothing when the
-- row doesn't exist yet — so two concurrent *first-time* submissions for the
-- same (plan_id, voter_name) can both see `existing.id is null` and race to
-- INSERT. The table-level `unique (plan_id, voter_name)` constraint (rsvps,
-- ratings) stops bad data landing, but the losing call gets an unhandled
-- Postgres 23505 instead of the function's own clean 42501/retry-into-update
-- path — a double-tap or a client retry racing the original request surfaces
-- a raw duplicate-key error instead of just working.
--
-- Fix: the standard Postgres pattern for a SELECT-then-branch upsert with
-- conditional conflict logic that plain `INSERT ... ON CONFLICT` can't express
-- (the "reject if a different participant already owns this name" check) —
-- loop, and on unique_violation from the INSERT, retry: the loop's next
-- iteration re-selects, now finds the concurrently-inserted row, and takes the
-- UPDATE branch. Bounded to at most two iterations in practice: rsvps/ratings
-- rows are never deleted, so once any INSERT lands the loop's next SELECT
-- always finds it.
--
-- Signatures and return type are unchanged (still `returns void`), so
-- PostgREST resolution and every existing caller are unaffected.

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

  loop
    select * into existing from rsvps where plan_id = p_plan_id and voter_name = clean_name for update;
    if existing.id is not null and existing.participant_token_hash is not null
       and existing.participant_token_hash <> p_participant_token_hash then
      raise exception 'That participant name is already in use' using errcode = '42501';
    end if;
    if existing.id is null then
      begin
        insert into rsvps (plan_id, voter_name, coming, choice, participant_token_hash)
        values (p_plan_id, clean_name, p_coming, p_choice, p_participant_token_hash);
        return;
      exception when unique_violation then
        -- a concurrent first-time RSVP for this name just committed; loop
        -- back and take the update branch against the row it created.
      end;
    else
      update rsvps set coming = p_coming, choice = p_choice, participant_token_hash = p_participant_token_hash
        where id = existing.id;
      return;
    end if;
  end loop;
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

  loop
    select * into existing from ratings where plan_id = p_plan_id and voter_name = clean_name for update;
    if existing.id is not null and existing.participant_token_hash is not null
       and existing.participant_token_hash <> p_participant_token_hash then
      raise exception 'That participant name is already in use' using errcode = '42501';
    end if;
    if existing.id is null then
      begin
        insert into ratings (plan_id, spot_id, voter_name, stars, again, participant_token_hash)
        values (p_plan_id, p_spot_id, clean_name, p_stars, p_again, p_participant_token_hash);
        return;
      exception when unique_violation then
        -- a concurrent first-time rating for this name just committed; loop
        -- back and take the update branch against the row it created.
      end;
    else
      update ratings set spot_id = p_spot_id, stars = p_stars, again = p_again,
        participant_token_hash = p_participant_token_hash where id = existing.id;
      return;
    end if;
  end loop;
end; $$;

-- create or replace preserves the ACL from 019/020 (authenticated only, no
-- anon, no public). Restated so a future drop+create keeps the same intent.
revoke all on function set_plan_rsvp(uuid, text, boolean, text, text) from public, anon;
grant execute on function set_plan_rsvp(uuid, text, boolean, text, text) to authenticated;
revoke all on function rate_plan(uuid, uuid, text, integer, boolean, text) from public, anon;
grant execute on function rate_plan(uuid, uuid, text, integer, boolean, text) to authenticated;

-- ── Verification (run after applying) ────────────────────────────────────
-- 1. Grants unchanged:
--    select has_function_privilege('anon','set_plan_rsvp(uuid,text,boolean,text,text)','execute'),
--           has_function_privilege('authenticated','set_plan_rsvp(uuid,text,boolean,text,text)','execute');
--    -- expect false, true
-- 2. Two concurrent first-time RSVPs for the same voter_name (fire from two
--    separate connections) must leave exactly one row and neither call may
--    raise an unhandled 23505 — see tests/rsvp-rating-upsert-race.dbtest.ts.
