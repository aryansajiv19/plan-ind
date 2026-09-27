-- Migration 069: plan lifecycle (roadmap Phase 1). STAGED -- written, not
-- applied anywhere. Applies after 068, at go-live. docs/ROADMAP.md items:
--   P4  deadlines fire without the host (expire_plan)
--   P11 rating only after the outing; unrating removes the visit it logged
--   seat_key: one stable, member-readable seat per account per plan
--   booking_owner by identity (confirmation-pass follow-up): who claimed the
--       booking is recorded per account in plan_booking_owners, and only that
--       account's leaving or deletion clears it -- not a same-named member.
-- Bodies are copied from their latest definitions and edited where marked 069.

-- ── booking_owner by identity ─────────────────────────────────────────────────
-- plans.booking_owner stays the label everyone reads; this records which
-- account claimed it. A side table, not a plans column: plans rows are sent
-- whole over Realtime, and user ids are not client-readable (049). RLS on,
-- no policies, no client grants -- only definer functions touch it. One row
-- per plan, so member claim/release RPCs later are an upsert/delete.
create table if not exists plan_booking_owners (
  plan_id uuid primary key references plans(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null
);
alter table plan_booking_owners enable row level security;
revoke all on plan_booking_owners from anon, authenticated;

-- ── P4: deadlines fire without the host ────────────────────────────────────

create or replace function plan_transition(p_plan_id uuid, p_command text)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  target plans%rowtype;
  finalists uuid[] := '{}';
  winner uuid;
begin
  select * into target from plans where id = p_plan_id for update;
  if target.id is null then
    raise exception 'That plan does not exist' using errcode = '22023';
  end if;

  if p_command = 'advance' then
    -- 067 (F5): already advanced or decided -- e.g. the host's other device
    -- got there first. Same answer as the first call, not an error.
    if target.status <> 'open' or target.stage in ('final', 'decided') then
      select coalesce(array_agg(spot_id order by pool_number), '{}') into finalists
        from plan_spots where plan_id = p_plan_id and advanced;
      return jsonb_build_object('plan', to_jsonb(target) - 'created_by_user_id',
        'winner_spot_id', target.winner_spot_id, 'finalists', finalists);
    end if;
    if target.stage <> 'pool' then
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
      -- 067 (F4): a tie, or a pool nobody voted in, goes to a per-plan hash --
      -- stable within the plan, but not the same catalogue venues every time.
      order by pool_number, yes_count desc, md5(p_plan_id::text || spot_id::text)
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
    -- 067 (F5): already decided: return it, as for advance above.
    if target.status = 'decided' then
      select coalesce(array_agg(spot_id order by pool_number), '{}') into finalists
        from plan_spots where plan_id = p_plan_id and advanced;
      return jsonb_build_object('plan', to_jsonb(target) - 'created_by_user_id',
        'winner_spot_id', target.winner_spot_id, 'finalists', finalists);
    end if;
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
  else
    raise exception 'Unsupported plan command';
  end if;

  select * into target from plans where id = p_plan_id;
  return jsonb_build_object('plan', to_jsonb(target) - 'created_by_user_id', 'winner_spot_id', target.winner_spot_id, 'finalists', finalists);
end;
$$;
-- Internal: execute_plan_command (host) and expire_plan (any member, only once
-- the deadline has passed) are its only callers.
revoke all on function plan_transition(uuid, text) from public, anon, authenticated;

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
  else
    raise exception 'Unsupported plan command';
  end if;

  select * into target from plans where id = p_plan_id;
  return jsonb_build_object('plan', to_jsonb(target) - 'created_by_user_id', 'winner_spot_id', target.winner_spot_id, 'finalists', finalists);
end;
$$;
revoke all on function execute_plan_command(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function execute_plan_command(uuid, text, text, jsonb) to authenticated;

-- 069 (P4): the deadline fires without the host. Any member's client calls
-- this on load and when the deadline passes; it moves the plan on only when
-- the deadline really has passed, so it can never close a round early.
-- Idempotent: the plan row lock serialises callers, and the rest find the new
-- state ('not_due' once advance has given the final round its hour).
create or replace function expire_plan(p_plan_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  target plans%rowtype;
  outcome text;
  finalists uuid[];
begin
  if not is_permanent_user() or not exists (
    select 1 from plan_access where plan_id = p_plan_id and user_id = auth.uid()
  ) then
    raise exception 'Plan access required' using errcode = '42501';
  end if;

  select * into target from plans where id = p_plan_id for update;
  if target.status = 'decided' then
    outcome := 'already_decided';
  elsif target.deadline is null or target.deadline > now() then
    outcome := 'not_due';
  elsif target.stage = 'pool' then
    perform plan_transition(p_plan_id, 'advance');
    outcome := 'advanced';
  elsif target.stage = 'final' then
    perform plan_transition(p_plan_id, 'decide');
    outcome := 'decided';
  else
    outcome := 'not_due';
  end if;

  select * into target from plans where id = p_plan_id;
  select coalesce(array_agg(spot_id order by pool_number), '{}') into finalists
    from plan_spots where plan_id = p_plan_id and advanced;
  return jsonb_build_object('result', outcome, 'plan', to_jsonb(target) - 'created_by_user_id',
    'winner_spot_id', target.winner_spot_id, 'finalists', finalists);
end; $$;
revoke all on function expire_plan(uuid) from public, anon, authenticated;
grant execute on function expire_plan(uuid) to authenticated;

create or replace function leave_plan(p_plan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  target plans%rowtype;
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

  -- 069: the booking claim goes with the account that made it, not with
  -- whoever shares its name (names repeat since 067 F2).
  if target.booked is not true
     and exists (select 1 from plan_booking_owners b where b.plan_id = p_plan_id and b.user_id = uid) then
    update plans set booking_owner = null where id = p_plan_id;
    delete from plan_booking_owners where plan_id = p_plan_id;
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
revoke all on function leave_plan(uuid) from public, anon, authenticated;
grant execute on function leave_plan(uuid) to authenticated;

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
  update plans p set booking_owner = 'Former member'
  where p.booked is not true
    and exists (select 1 from plan_booking_owners b where b.plan_id = p.id and b.user_id = uid);

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

-- ── P11: rating only after the outing ─────────────────────────────────────────
-- When a plan was decided, kept by one trigger so decide, direct plans (born
-- decided) and reopen all stay right without touching those functions.
alter table plans add column if not exists decided_at timestamptz;
grant select (decided_at) on plans to authenticated;

create or replace function stamp_plan_decided_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.status = 'decided' then
    if tg_op = 'INSERT' or old.status is distinct from 'decided' then
      new.decided_at := now();
    end if;
  else
    new.decided_at := null;
  end if;
  return new;
end; $$;
revoke all on function stamp_plan_decided_at() from public, anon, authenticated;
drop trigger if exists plans_stamp_decided_at on plans;
create trigger plans_stamp_decided_at before insert or update of status on plans
  for each row execute function stamp_plan_decided_at();

-- Plans decided before this migration: the earliest honest bound.
update plans set decided_at = created_at where status = 'decided' and decided_at is null;

create or replace function rate_plan(
  p_plan_id uuid, p_spot_id uuid, p_voter_name text, p_stars integer, p_again boolean, p_participant_token_hash text
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing ratings%rowtype;
  target plans%rowtype;
  -- 067 (F2): a label only -- the caller's own profile name; p_voter_name only without one.
  clean_name text := clean_display_name(coalesce(
    (select pe.display_name from people pe where pe.auth_user_id = auth.uid()), p_voter_name));
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
  -- 069 (P11): only after the outing -- its time, or 3 hours after the plan
  -- was decided when no time was set. A rating straight after deciding logged
  -- a visit that never happened and blocked reopen for good.
  if coalesce(target.event_time, target.decided_at + interval '3 hours') > now() then
    raise exception 'Rating opens after the outing' using errcode = '22023';
  end if;

  for attempt in 1..3 loop
    select * into existing from ratings where plan_id = p_plan_id and user_id = caller for update;
    -- 067 (F2): no name-in-use refusal; the name is a label.
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

create or replace function unrate_plan(p_plan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  removed int;
  removed_visits int;
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
  -- 069 (P11): the rating is what logged the caller's visit for this plan, so
  -- take that back too -- unless it has photos (deleting it would orphan the
  -- files, the same rule logVisit keeps). A leftover visit also blocks reopen.
  delete from visits v
  using people pe
  where v.plan_id = p_plan_id and v.person_id = pe.id and pe.auth_user_id = auth.uid()
    and not exists (select 1 from visit_photos ph where ph.visit_id = v.id);
  get diagnostics removed_visits = row_count;
  return jsonb_build_object('result', case when removed > 0 then 'removed' else 'not_rated' end,
    'visit_removed', removed_visits > 0);
end;
$$;
revoke all on function unrate_plan(uuid) from public, anon, authenticated;
grant execute on function unrate_plan(uuid) to authenticated;

-- ── seat_key: one seat per account per plan ─────────────────────────────────
-- participant_token_hash is per device, so one account on two devices showed
-- as two seats. seat_key is derived from the account and the plan, readable by
-- members while user_id itself stays hidden (049). Salting with plan_id keeps
-- it from linking one person across plans; null on anonymised rows (no
-- user_id). Generated, so every write path and every old row carries it.
alter table votes   add column if not exists seat_key text generated always as (md5(plan_id::text || ':' || user_id::text)) stored;
alter table rsvps   add column if not exists seat_key text generated always as (md5(plan_id::text || ':' || user_id::text)) stored;
alter table ratings add column if not exists seat_key text generated always as (md5(plan_id::text || ':' || user_id::text)) stored;
grant select (seat_key) on votes to authenticated;
grant select (seat_key) on rsvps to authenticated;
grant select (seat_key) on ratings to authenticated;

create or replace function my_plan_rows(p_plan_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not exists (select 1 from plan_access where plan_id = p_plan_id and user_id = uid) then
    raise exception 'Plan access required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'votes', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'phase', v.phase,
                         'pool_number', v.pool_number, 'spot_id', v.spot_id) order by v.phase, v.pool_number)
                       from votes v where v.plan_id = p_plan_id and v.user_id = uid), '[]'::jsonb),
    'rsvp_id', (select r.id from rsvps r where r.plan_id = p_plan_id and r.user_id = uid),
    'rating_id', (select r.id from ratings r where r.plan_id = p_plan_id and r.user_id = uid),
    -- 069: the caller's own seat, as it appears on every row they write.
    'seat_key', md5(p_plan_id::text || ':' || uid::text));
end; $$;
revoke all on function my_plan_rows(uuid) from public, anon, authenticated;
grant execute on function my_plan_rows(uuid) to authenticated;
