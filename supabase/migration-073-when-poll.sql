-- Migration 073: "When" -- a time poll per plan (roadmap P21). STAGED --
-- written, not applied anywhere. Applies after 069 (plan_transition,
-- plan_host_authorized) and 071.
--
-- The host offers 2-4 future start times (within 60 days) or none; members
-- tick every option they can make (availability, not one pick) while the plan
-- is open; at decide, if no time is set, the most-ticked option becomes
-- plans.event_time (tie: earliest) -- which then drives P11's rating window.
-- The host can replace the options only until someone has ticked one, and a
-- time the host sets by hand always wins.
--
-- plan_time_votes holds no user_id at all: it is in the Realtime publication
-- (live ticks), which sends whole rows, so the account is stored only as the
-- per-plan seat_key (069's md5 of plan + user). The RPC derives it from
-- auth.uid(); it can't be reversed without the user id. Reads go through
-- plan_access like votes; writes only through the two RPCs below.

create table if not exists plan_time_options (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references plans(id) on delete cascade,
  starts_at  timestamptz not null,
  created_at timestamptz not null default now(),
  unique (plan_id, starts_at)
);
create table if not exists plan_time_votes (
  option_id  uuid not null references plan_time_options(id) on delete cascade,
  plan_id    uuid not null references plans(id) on delete cascade,
  seat_key   text not null check (seat_key ~ '^[0-9a-f]{32}$'),
  created_at timestamptz not null default now(),
  primary key (option_id, seat_key)
);
create index if not exists plan_time_options_plan_idx on plan_time_options (plan_id);
create index if not exists plan_time_votes_plan_idx on plan_time_votes (plan_id);
-- As 045 did for votes/rsvps/ratings: a DELETE (an un-tick) must carry
-- plan_id, or a Realtime subscription filtered on it never hears about it.
-- The columns are option_id, plan_id, seat_key, created_at -- nothing hidden.
alter table plan_time_votes replica identity full;

alter table plan_time_options enable row level security;
alter table plan_time_votes enable row level security;
revoke all on plan_time_options from anon, authenticated;
revoke all on plan_time_votes from anon, authenticated;
grant select on plan_time_options to authenticated;
grant select on plan_time_votes to authenticated;
drop policy if exists "read accessible time options" on plan_time_options;
create policy "read accessible time options" on plan_time_options for select to authenticated using (
  is_permanent_user() and exists (select 1 from plan_access a where a.plan_id = plan_time_options.plan_id and a.user_id = (select auth.uid()))
);
drop policy if exists "read accessible time votes" on plan_time_votes;
create policy "read accessible time votes" on plan_time_votes for select to authenticated using (
  is_permanent_user() and exists (select 1 from plan_access a where a.plan_id = plan_time_votes.plan_id and a.user_id = (select auth.uid()))
);

do $$ begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'plan_time_votes') then
    alter publication supabase_realtime add table plan_time_votes;
  end if;
end $$;

-- The host sets or replaces the options: 0 (no "When") or 2-4 distinct times,
-- each in the future and within 60 days. Refused once anyone has ticked.
create or replace function set_plan_when(p_plan_id uuid, p_host_token text, p_options timestamptz[])
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target plans%rowtype;
  n int := coalesce(cardinality(p_options), 0);
begin
  select * into target from plans where id = p_plan_id for update;
  if target.id is null or not plan_host_authorized(p_plan_id, p_host_token) then
    return jsonb_build_object('result', 'not_host');
  end if;
  if target.status <> 'open' then
    return jsonb_build_object('result', 'already_decided');
  end if;
  if exists (select 1 from plan_time_votes where plan_id = p_plan_id) then
    return jsonb_build_object('result', 'already_voting');
  end if;
  if n = 1 or n > 4
     or n <> (select count(distinct x) from unnest(p_options) x)
     or exists (select 1 from unnest(p_options) x where x is null or x <= now() or x > now() + interval '60 days') then
    return jsonb_build_object('result', 'invalid_options');
  end if;
  delete from plan_time_options where plan_id = p_plan_id;
  insert into plan_time_options (plan_id, starts_at) select p_plan_id, x from unnest(p_options) x;
  return jsonb_build_object('result', 'set', 'options', coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'starts_at', starts_at) order by starts_at)
    from plan_time_options where plan_id = p_plan_id), '[]'::jsonb));
end; $$;
revoke all on function set_plan_when(uuid, text, timestamptz[]) from public, anon, authenticated;
grant execute on function set_plan_when(uuid, text, timestamptz[]) to authenticated;

-- A member ticks (or unticks) an option they can make. Idempotent.
create or replace function set_time_availability(p_plan_id uuid, p_option_id uuid, p_available boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target plans%rowtype;
  seat text := md5(p_plan_id::text || ':' || auth.uid()::text);
begin
  if not is_permanent_user() or not exists (
    select 1 from plan_access where plan_id = p_plan_id and user_id = auth.uid()
  ) then
    raise exception 'Plan access required' using errcode = '42501';
  end if;
  select * into target from plans where id = p_plan_id;
  if target.status <> 'open' then
    raise exception 'This plan is decided; its time is set' using errcode = '22023';
  end if;
  if not exists (select 1 from plan_time_options where id = p_option_id and plan_id = p_plan_id) then
    raise exception 'That time is not on this plan' using errcode = '22023';
  end if;
  -- Un-ticking a past time is harmless; ticking one would vote for it.
  if p_available and exists (select 1 from plan_time_options where id = p_option_id and starts_at <= now()) then
    raise exception 'That time has passed' using errcode = '22023';
  end if;
  if p_available then
    insert into plan_time_votes (option_id, plan_id, seat_key) values (p_option_id, p_plan_id, seat)
    on conflict do nothing;
  else
    delete from plan_time_votes where option_id = p_option_id and seat_key = seat;
  end if;
  return jsonb_build_object('option_id', p_option_id, 'available', p_available, 'seat_key', seat);
end; $$;
revoke all on function set_time_availability(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function set_time_availability(uuid, uuid, boolean) to authenticated;

-- plan_transition (069 body, copied verbatim, edited where marked 073).
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
    -- 073 (P21): with no time set yet, the "When" option most members can make
    -- becomes the time (a tie goes to the earliest). No ticks: no time. A time
    -- the host set by hand is never overwritten while it is still ahead. Only
    -- a time still ahead counts: a past one would open rating and
    -- plan_has_happened at once, so with none ahead there is no time and
    -- decided_at + 3h stands. That includes a reopened plan re-decided after
    -- its first decision's time.
    update plans set event_time = (
      select o.starts_at from plan_time_options o
      join plan_time_votes t on t.option_id = o.id
      where o.plan_id = p_plan_id and o.starts_at > now()
      group by o.id, o.starts_at
      order by count(*) desc, o.starts_at
      limit 1)
    where id = p_plan_id and (event_time is null or event_time <= now());
  else
    raise exception 'Unsupported plan command';
  end if;

  select * into target from plans where id = p_plan_id;
  return jsonb_build_object('plan', to_jsonb(target) - 'created_by_user_id', 'winner_spot_id', target.winner_spot_id, 'finalists', finalists);
end;
$$;
revoke all on function plan_transition(uuid, text) from public, anon, authenticated;

-- leave_plan and delete_my_account (069 bodies, copied verbatim, edited where
-- marked 073). Ticks hold no account id and no FK to one, so nothing else
-- takes them with the member (security review).
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
    -- 073: and this member's "When" ticks, while they still count.
    delete from plan_time_votes where plan_id = p_plan_id and seat_key = md5(p_plan_id::text || ':' || uid::text);
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
