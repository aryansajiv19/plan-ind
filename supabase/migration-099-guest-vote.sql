-- Migration 099: guest voting. Apply after 097. STAGED -- written and tested on
-- a local database only, NOT applied to the live project. Applying it is an
-- owner decision. Design note: docs/GUEST_VOTE.md.
--
-- What: an invitee opens a plan link, types a first name and votes. A guest is
-- a Supabase *anonymous* session (is_anonymous claim) bound to exactly ONE plan
-- by a guest_sessions row. 064's rule ("participation needs a permanent
-- account") becomes "needs a permanent account OR an active guest of THIS plan".
--
-- Additive; no destructive statement. Re-run safe (create if not exists /
-- create or replace / alter policy). The two re-created participant RPCs
-- (cast_plan_vote, set_plan_rsvp) keep their signatures and ACLs.
--
-- Who can now do what:
--   * A guest session (anonymous, with an active guest_sessions row) can READ
--     its one plan's plans/plan_spots/votes/rsvps/ratings rows, the custom
--     spots on it, and its presence topic -- through the same plan_access rule
--     as a member (and so Realtime postgres_changes, which applies table RLS).
--   * It can WRITE only through cast_plan_vote and set_plan_rsvp, on its own
--     plan. rate_plan, unrate_plan, leave_plan, set_time_availability, claim_*,
--     booking, plan creation, friends, folders, visits, uploads, Luna and place
--     import stay account-only (they all key on is_permanent_user() or the JWT
--     claim, and this migration does not touch them).
--   * Nobody gets a new direct write policy. votes/rsvps/ratings keep none.
--   * guest_sessions has RLS on and NO policy and no client grant: it is read
--     and written only by the security-definer functions below.
--   * A guest has no age. It is treated as the youngest account (13, the same
--     rule /api/spots/deal/sample applies to an unknown age): it may join and
--     act only on a plan whose required age (category and every dealt spot,
--     plan_required_age) is 13 or under. A plan that later gains an age-gated
--     place stops being readable/writable by its guests.

-- ── 1. guest_sessions ─────────────────────────────────────────────────────
create table if not exists guest_sessions (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  plan_id    uuid not null references plans(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  -- sha256 of the one-time secret the browser keeps across the sign-in
  -- redirect (issue_guest_merge_token); never the secret itself.
  merge_token_hash text,
  merge_token_at timestamptz,
  merged_into uuid references auth.users(id) on delete set null,
  merged_at timestamptz
);
create index if not exists guest_sessions_plan_idx on guest_sessions (plan_id) where merged_into is null;
create unique index if not exists guest_sessions_merge_key on guest_sessions (merge_token_hash)
  where merge_token_hash is not null;
alter table guest_sessions enable row level security;
revoke all on table guest_sessions from public, anon, authenticated;

-- ── 2. Limits ─────────────────────────────────────────────────────────────
-- Called by the server route BEFORE it creates the anonymous session (there is
-- no session yet, so like consume_otp_limit it is keyed on an HMAC'd client IP
-- and needs the control secret). Per IP: 10/minute, 60/day -- a table of
-- friends on one carrier IP still fits. The GLOBAL daily ceiling (800) is not
-- here: it is counted in join_plan_as_guest, only when a new guest row is
-- really created, so garbage Turnstile tokens cannot burn it.
create or replace function consume_guest_limit(p_secret text, p_subject text)
returns boolean language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  subject_key text := left(p_subject, 128);
  minute_start timestamptz := date_trunc('minute', now());
  day_start timestamptz := date_trunc('day', now());
  current_count integer;
begin
  if not valid_control_secret(p_secret) or subject_key is null or subject_key = '' then
    raise exception 'Server authorization required' using errcode = '42501';
  end if;
  insert into app_rate_limits values ('guest-join-minute', subject_key, minute_start, 1)
    on conflict (scope, subject, window_start) do update set request_count = app_rate_limits.request_count + 1
    returning request_count into current_count;
  if current_count > 10 then return false; end if;
  insert into app_rate_limits values ('guest-join-day', subject_key, day_start, 1)
    on conflict (scope, subject, window_start) do update set request_count = app_rate_limits.request_count + 1
    returning request_count into current_count;
  if current_count > 60 then return false; end if;
  return true;
end; $$;
revoke all on function consume_guest_limit(text, text) from public, anon, authenticated;
grant execute on function consume_guest_limit(text, text) to anon, authenticated;

-- ── 3. Predicates ─────────────────────────────────────────────────────────
-- Stable, lock-free: used inside RLS policies. p_plan_id null = "any plan"
-- (the policies also require a plan_access row for the row's own plan, and a
-- guest can only ever hold one: claim_plan_access still refuses anonymous
-- sessions and join_plan_as_guest is the only other writer of plan_access).
create or replace function is_active_guest(p_plan_id uuid default null)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from guest_sessions g
    where g.user_id = auth.uid()
      and (p_plan_id is null or g.plan_id = p_plan_id)
      and g.merged_into is null
      and g.expires_at > now()
      and not is_permanent_user()
      -- A guest has no age: the youngest account's (lib/age-policy MIN_ACCOUNT_AGE).
      and coalesce(plan_required_age(g.plan_id), 99) <= 13)
$$;
revoke all on function is_active_guest(uuid) from public, anon;
grant execute on function is_active_guest(uuid) to authenticated;

-- The write-path version: the same test, but it takes a share lock on the
-- guest row, so a vote cannot slip in after merge_guest_into_me (which holds
-- the row for update) has moved the ballots. Internal.
create or replace function guest_may_act(p_plan_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform 1 from guest_sessions g
  where g.user_id = auth.uid() and g.plan_id = p_plan_id
    and g.merged_into is null and g.expires_at > now()
    and not is_permanent_user()
    and coalesce(plan_required_age(g.plan_id), 99) <= 13
  for share of g;
  return found;
end; $$;
revoke all on function guest_may_act(uuid) from public, anon, authenticated;

-- ── 4. Join as a guest ────────────────────────────────────────────────────
-- Called by the route with the guest's own (anonymous) session, after the
-- Turnstile check (done by Supabase Auth when it created the session) and
-- consume_guest_limit. Needs the control secret, so a browser cannot call it
-- directly. Expected refusals come back as a status, not an error:
--   joined | already | full | age_gated | other_plan | expired | merged | removed | limited
create or replace function join_plan_as_guest(p_secret text, p_plan_id uuid, p_name text)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  uid uuid := auth.uid();
  clean_name text := clean_display_name(p_name);
  existing guest_sessions%rowtype;
  global_count integer;
begin
  if uid is null or not valid_control_secret(p_secret) then
    raise exception 'Server authorization required' using errcode = '42501';
  end if;
  if is_permanent_user() then
    raise exception 'Signed-in accounts join with claim_plan_access' using errcode = '42501';
  end if;
  if clean_name = '' then
    raise exception 'Enter a name before voting' using errcode = '22023';
  end if;
  -- Serialises joins per plan, so the cap below cannot be raced past.
  perform 1 from plans where id = p_plan_id for update;
  if not found then
    raise exception 'That plan does not exist' using errcode = '22023';
  end if;
  if exists (select 1 from plan_removed_members where plan_id = p_plan_id and user_id = uid) then
    return jsonb_build_object('status', 'removed');
  end if;

  select * into existing from guest_sessions where user_id = uid;
  if found then
    if existing.plan_id <> p_plan_id then return jsonb_build_object('status', 'other_plan'); end if;
    if existing.merged_into is not null then return jsonb_build_object('status', 'merged'); end if;
    if existing.expires_at <= now() then return jsonb_build_object('status', 'expired'); end if;
    if coalesce(plan_required_age(p_plan_id), 99) > 13 then return jsonb_build_object('status', 'age_gated'); end if;
    insert into plan_access (plan_id, user_id) values (p_plan_id, uid) on conflict do nothing;
    return jsonb_build_object('status', 'already', 'name', existing.display_name);
  end if;

  if coalesce(plan_required_age(p_plan_id), 99) > 13 then
    return jsonb_build_object('status', 'age_gated');
  end if;
  -- The cap counts guests that still hold access: a removed guest frees its slot.
  if (select count(*) from guest_sessions g
      join plan_access a on a.plan_id = g.plan_id and a.user_id = g.user_id
      where g.plan_id = p_plan_id and g.merged_into is null and g.expires_at > now()) >= 20 then
    return jsonb_build_object('status', 'full');
  end if;
  -- Global ceiling: 800 new guest sessions a day. Counted only here, on the
  -- branch that mints a row, so a refused or invalid attempt never spends it.
  insert into app_rate_limits values ('guest-join-global', 'global', date_trunc('day', now()), 1)
    on conflict (scope, subject, window_start) do update set request_count = app_rate_limits.request_count + 1
      where app_rate_limits.request_count < 800
    returning request_count into global_count;
  if global_count is null then
    return jsonb_build_object('status', 'limited');
  end if;

  insert into guest_sessions (user_id, plan_id, display_name) values (uid, p_plan_id, clean_name);
  insert into plan_access (plan_id, user_id) values (p_plan_id, uid) on conflict do nothing;
  return jsonb_build_object('status', 'joined', 'name', clean_name);
end; $$;
revoke all on function join_plan_as_guest(text, uuid, text) from public, anon, authenticated;
grant execute on function join_plan_as_guest(text, uuid, text) to authenticated;

-- ── 5. Upgrade: carry a guest's ballots to a permanent account ────────────
-- Step 1 (guest session, before sign-in): a one-time secret the browser keeps.
-- Calling it again rotates the secret.
create or replace function issue_guest_merge_token()
returns text language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare token text := encode(gen_random_bytes(32), 'hex');
begin
  if auth.uid() is null or is_permanent_user() then
    raise exception 'Guest session required' using errcode = '42501';
  end if;
  update guest_sessions
    set merge_token_hash = encode(digest(token, 'sha256'), 'hex'), merge_token_at = now()
    where user_id = auth.uid() and merged_into is null and expires_at > now();
  if not found then
    raise exception 'Guest session required' using errcode = '42501';
  end if;
  return token;
end; $$;
revoke all on function issue_guest_merge_token() from public, anon, authenticated;
grant execute on function issue_guest_merge_token() to authenticated;

-- Step 2 (the new permanent session): move the guest's plan_access, ballots and
-- reply to the caller. One ballot per account per round: where the caller
-- already voted a round (or replied) the caller's own row wins and the guest's
-- duplicate is dropped. Idempotent: the same token by the same caller again
-- answers 'already'; by anyone else is refused. The secret is single-owner:
-- the first permanent caller claims it.
create or replace function merge_guest_into_me(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  uid uuid := auth.uid();
  g guest_sessions%rowtype;
  required_age integer;
  age_value integer;
  votes_moved integer;
  rsvps_moved integer;
begin
  if not is_permanent_user() then
    raise exception 'Sign in to keep your votes' using errcode = '42501';
  end if;
  select * into g from guest_sessions
    where merge_token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
      and merge_token_at > now() - interval '1 day'
    for update;
  if not found then
    raise exception 'That guest link is not valid' using errcode = '42501';
  end if;
  if g.merged_into is not null then
    if g.merged_into = uid then
      return jsonb_build_object('status', 'already', 'plan_id', g.plan_id);
    end if;
    raise exception 'That guest link is not valid' using errcode = '42501';
  end if;
  -- The guest upgraded in place (linked identity): same uid, nothing to move.
  if g.user_id = uid then
    update guest_sessions set merged_into = uid, merged_at = now() where user_id = g.user_id;
    return jsonb_build_object('status', 'linked', 'plan_id', g.plan_id);
  end if;

  perform 1 from plans where id = g.plan_id for key share;
  if not found then
    return jsonb_build_object('status', 'gone', 'plan_id', g.plan_id);
  end if;
  if exists (select 1 from plan_removed_members where plan_id = g.plan_id and user_id in (uid, g.user_id)) then
    raise exception 'The host removed you from this plan.' using errcode = '42501';
  end if;
  -- A new member meets the plan's age gate exactly as in claim_plan_access
  -- (a plan can have gained an age-gated place since the guest joined).
  if not exists (select 1 from plan_access where plan_id = g.plan_id and user_id = uid) then
    required_age := coalesce(plan_required_age(g.plan_id), 0);
    age_value := current_member_age();
    if required_age > 0 and age_value is null then
      raise exception 'Add your date of birth to join this plan.' using errcode = '42501';
    end if;
    if age_value < required_age then
      raise exception 'This plan is for ages % and up.', required_age using errcode = '42501';
    end if;
    insert into plan_access (plan_id, user_id) values (g.plan_id, uid) on conflict do nothing;
  end if;

  delete from votes gv where gv.plan_id = g.plan_id and gv.user_id = g.user_id
    and exists (select 1 from votes cv where cv.plan_id = gv.plan_id and cv.user_id = uid
                and cv.phase = gv.phase and cv.pool_number = gv.pool_number);
  update votes set user_id = uid where plan_id = g.plan_id and user_id = g.user_id;
  get diagnostics votes_moved = row_count;
  delete from rsvps gr where gr.plan_id = g.plan_id and gr.user_id = g.user_id
    and exists (select 1 from rsvps cr where cr.plan_id = gr.plan_id and cr.user_id = uid);
  update rsvps set user_id = uid where plan_id = g.plan_id and user_id = g.user_id;
  get diagnostics rsvps_moved = row_count;
  delete from plan_access where plan_id = g.plan_id and user_id = g.user_id;
  update guest_sessions set merged_into = uid, merged_at = now() where user_id = g.user_id;
  return jsonb_build_object('status', 'merged', 'plan_id', g.plan_id,
    'votes_moved', votes_moved, 'rsvps_moved', rsvps_moved);
end; $$;
revoke all on function merge_guest_into_me(text) from public, anon, authenticated;
grant execute on function merge_guest_into_me(text) to authenticated;

-- ── 6. Reads: a permanent account OR an active guest ──────────────────────
-- Same bodies as 064 with the guest alternative. Still gated by plan_access.
alter policy "read own plan access" on plan_access
  using (((select is_permanent_user()) or (select is_active_guest())) and user_id = (select auth.uid()));

alter policy "read accessible plans" on plans using (
  ((select is_permanent_user()) or (select is_active_guest())) and (
    created_by_user_id = (select auth.uid()) or exists (
      select 1 from plan_access a where a.plan_id = plans.id and a.user_id = (select auth.uid())
    )
  )
);
alter policy "read accessible plan spots" on plan_spots using (
  ((select is_permanent_user()) or (select is_active_guest())) and exists (
    select 1 from plan_access a where a.plan_id = plan_spots.plan_id and a.user_id = (select auth.uid()))
);
alter policy "read accessible votes" on votes using (
  ((select is_permanent_user()) or (select is_active_guest())) and exists (
    select 1 from plan_access a where a.plan_id = votes.plan_id and a.user_id = (select auth.uid()))
);
alter policy "read accessible rsvps" on rsvps using (
  ((select is_permanent_user()) or (select is_active_guest())) and exists (
    select 1 from plan_access a where a.plan_id = rsvps.plan_id and a.user_id = (select auth.uid()))
);
alter policy "read accessible ratings" on ratings using (
  ((select is_permanent_user()) or (select is_active_guest())) and exists (
    select 1 from plan_access a where a.plan_id = ratings.plan_id and a.user_id = (select auth.uid()))
);
alter policy "read permitted spots" on spots using (
  source = 'curated'
  or visibility = 'community'
  or created_by_user_id = (select auth.uid())
  or (((select is_permanent_user()) or (select is_active_guest())) and exists (
    select 1 from plan_spots ps
    join plan_access a on a.plan_id = ps.plan_id
    where ps.spot_id = spots.id and a.user_id = (select auth.uid())
  ))
);
alter policy "plan members receive presence" on realtime.messages using (
  realtime.messages.extension = 'presence'
  and (select realtime.topic()) ~ '^plan:[0-9a-f-]{36}:presence$'
  and ((select public.is_permanent_user()) or (select public.is_active_guest()))
  and exists(select 1 from public.plan_access a where a.user_id=(select auth.uid())
    and a.plan_id=split_part((select realtime.topic()),':',2)::uuid)
);
alter policy "plan members send presence" on realtime.messages with check (
  realtime.messages.extension = 'presence'
  and (select realtime.topic()) ~ '^plan:[0-9a-f-]{36}:presence$'
  and ((select public.is_permanent_user()) or (select public.is_active_guest()))
  and exists(select 1 from public.plan_access a where a.user_id=(select auth.uid())
    and a.plan_id=split_part((select realtime.topic()),':',2)::uuid)
);

-- ── 7. Writes: cast_plan_vote and set_plan_rsvp admit a guest of THIS plan ─
-- The 067 bodies verbatim; only the 064 guard changes, plus a guest's stored
-- name (never the request body's) labels its ballot.

create or replace function cast_plan_vote(
  p_plan_id uuid, p_spot_id uuid, p_voter_name text, p_value boolean,
  p_phase text, p_pool_number smallint, p_participant_token_hash text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target plans%rowtype;
  -- 067 (F2): a label only -- the caller's own profile name; p_voter_name only without one.
  clean_name text := clean_display_name(coalesce(
    (select pe.display_name from people pe where pe.auth_user_id = auth.uid()),
    (select gs.display_name from guest_sessions gs where gs.user_id = auth.uid()), p_voter_name));
  caller uuid := auth.uid();
begin
  -- 064 + 099: a permanent account, or an active guest of this very plan.
  if not is_permanent_user() and not guest_may_act(p_plan_id) then
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
  -- 067 (F2): a label only -- the caller's own profile name; p_voter_name only without one.
  clean_name text := clean_display_name(coalesce(
    (select pe.display_name from people pe where pe.auth_user_id = auth.uid()),
    (select gs.display_name from guest_sessions gs where gs.user_id = auth.uid()), p_voter_name));
  caller uuid := auth.uid();
begin
  -- 064 + 099: a permanent account, or an active guest of this very plan.
  if not is_permanent_user() and not guest_may_act(p_plan_id) then
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
    -- 067 (F2): no name-in-use refusal; the name is a label.
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

-- ── 8. Host removal ends a guest's pass; guests cannot delete accounts ────
-- remove_plan_member and delete_my_account: current bodies verbatim, one change each.
create or replace function remove_plan_member(p_plan_id uuid, p_seat_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  target plans%rowtype;
  member uuid;
begin
  if not is_permanent_user() or uid is null then
    raise exception 'Sign in to manage this plan' using errcode = '42501';
  end if;

  -- Same lock order as leave_plan (plans, then child rows).
  select * into target from plans where id = p_plan_id for update;
  if target.id is null then
    return jsonb_build_object('result', 'not_found');
  end if;
  if target.created_by_user_id is distinct from uid then
    return jsonb_build_object('result', 'not_host');
  end if;

  select a.user_id into member from plan_access a
  where a.plan_id = p_plan_id and md5(p_plan_id::text || ':' || a.user_id::text) = p_seat_key;
  if member is null then
    return jsonb_build_object('result', 'not_member');
  end if;
  if member = uid then
    return jsonb_build_object('result', 'cannot_remove_host');
  end if;

  if target.booked is not true
     and exists (select 1 from plan_booking_owners b where b.plan_id = p_plan_id and b.user_id = member) then
    update plans set booking_owner = null where id = p_plan_id;
    delete from plan_booking_owners where plan_id = p_plan_id;
  end if;

  if target.status = 'open' then
    delete from votes where plan_id = p_plan_id and user_id = member;
    delete from plan_time_votes where plan_id = p_plan_id and seat_key = p_seat_key;
  end if;
  delete from rsvps where plan_id = p_plan_id and user_id = member;
  if target.status <> 'open' then
    delete from ratings where plan_id = p_plan_id and user_id = member;
  end if;
  -- 099: a removed guest's pass ends with its access (the guest cap also counts access).
  update guest_sessions set expires_at = now() where user_id = member and plan_id = p_plan_id;
  delete from plan_access where plan_id = p_plan_id and user_id = member;
  insert into plan_removed_members (plan_id, user_id) values (p_plan_id, member)
  on conflict do nothing;

  return jsonb_build_object('result', 'removed');
end;
$$;
revoke all on function remove_plan_member(uuid, text) from public, anon, authenticated;
grant execute on function remove_plan_member(uuid, text) to authenticated;

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
  -- 099: guests (anonymous sessions) do not delete accounts: it would free a
  -- guest slot and anonymise a ballot, then let the same person vote again.
  if uid is null or not is_permanent_user() then
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
