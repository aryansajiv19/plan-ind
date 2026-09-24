-- Migration 061: vote integrity and guest limits. Apply after 060. STAGED --
-- written, not applied anywhere.
--
-- 1. One ballot per account. cast_plan_vote keyed the vote on the caller-chosen
--    participant_token_hash, so one session could mint any number of hashes
--    and vote any number of times; set_plan_rsvp / rate_plan keyed on the typed
--    name, so one account could reply or rate under many names. 043 deferred
--    the fix because of legacy user_id-null rows; those were deleted live on
--    2026-09-18. The natural key is now the auth user:
--      votes   (plan_id, user_id, phase, pool_number)
--      rsvps   (plan_id, user_id)
--      ratings (plan_id, user_id)
--    as partial unique indexes WHERE user_id IS NOT NULL. The RPCs upsert on
--    that key, only ever touch the caller's own row, and simply overwrite the
--    stored hash with the one presented: the hash is a per-browser marker the
--    UI uses to spot its own row, not an identity, so a second device just
--    takes it over. A hash already on someone else's row -- including an
--    ownerless one -- is still refused, as 043 did.
--    user_id stays NULLABLE on purpose: delete_my_account (060) anonymises
--    decided votes to user_id null, and every user_id FK is ON DELETE SET
--    NULL. Those ownerless rows are outside the key and no RPC can claim them.
--
--    ⚠ DESTRUCTIVE STEP, deliberate: before each unique index is built, the
--    duplicates that would block it are DELETED, keeping the latest row per
--    key (created_at, then id, descending -- deterministic). Those extra rows
--    ARE the stuffed ballots. The tables are locked for the transaction so no
--    new duplicate can land between the delete and the index.
--
-- 2. Deadline enforced. cast_plan_vote refuses once plans.deadline has passed.
--    Host commands (execute_plan_command advance/decide) do not go through it
--    and still run after the deadline, which is exactly what the host's
--    auto-pick does. reopen_plan sets a fresh (or null) deadline, so a
--    reopened plan is votable again.
-- 3. voter_name goes through clean_display_name (052's one sanitiser).
-- 4. Guests (anonymous sessions) can no longer upload to visit-photos.
-- 5. visit_photos rows and files are no longer readable without a session.
--
-- Re-run safe: create or replace / if not exists / drop policy if exists; the
-- dedupe deletes nothing on a second run. No row shape changes.

begin;
-- Fail fast instead of queueing every vote behind a long-running transaction.
set local lock_timeout = '5s';

lock table votes, rsvps, ratings in share row exclusive mode;

-- ── 1a. dedupe, then the per-user keys ────────────────────────────────────
delete from votes v using votes newer
where v.user_id is not null
  and newer.plan_id = v.plan_id and newer.user_id = v.user_id
  and newer.phase = v.phase and newer.pool_number = v.pool_number
  and (newer.created_at, newer.id) > (v.created_at, v.id);
create unique index if not exists votes_user_round_key
  on votes (plan_id, user_id, phase, pool_number) where user_id is not null;

delete from rsvps r using rsvps newer
where r.user_id is not null
  and newer.plan_id = r.plan_id and newer.user_id = r.user_id
  and (newer.created_at, newer.id) > (r.created_at, r.id);
create unique index if not exists rsvps_user_key
  on rsvps (plan_id, user_id) where user_id is not null;

delete from ratings r using ratings newer
where r.user_id is not null
  and newer.plan_id = r.plan_id and newer.user_id = r.user_id
  and (newer.created_at, newer.id) > (r.created_at, r.id);
create unique index if not exists ratings_user_key
  on ratings (plan_id, user_id) where user_id is not null;

-- ── 1b/2/3. the write RPCs, same signatures ───────────────────────────────
create or replace function cast_plan_vote(
  p_plan_id uuid, p_spot_id uuid, p_voter_name text, p_value boolean,
  p_phase text, p_pool_number smallint, p_participant_token_hash text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target plans%rowtype;
  clean_name text := clean_display_name(p_voter_name);
  caller uuid := auth.uid();
begin
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

-- Who can call these: signed-in sessions (guests included -- guests vote).
revoke all on function cast_plan_vote(uuid, uuid, text, boolean, text, smallint, text) from public, anon, authenticated;
revoke all on function set_plan_rsvp(uuid, text, boolean, text, text, text, smallint) from public, anon, authenticated;
revoke all on function rate_plan(uuid, uuid, text, integer, boolean, text) from public, anon, authenticated;
grant execute on function cast_plan_vote(uuid, uuid, text, boolean, text, smallint, text) to authenticated;
grant execute on function set_plan_rsvp(uuid, text, boolean, text, text, text, smallint) to authenticated;
grant execute on function rate_plan(uuid, uuid, text, integer, boolean, text) to authenticated;

-- ── 4. visit-photos uploads: permanent accounts only ──────────────────────
-- Who: a permanent (non-anonymous) session, into its own uid folder. A guest
-- session costs nothing to mint, and each could store unlimited 8MB files; no
-- guest flow uploads (visit_photos rows already need a people profile).
drop policy if exists "upload own visit photos" on storage.objects;
create policy "upload own visit photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'visit-photos' and public.is_permanent_user()
              and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ── 5. visit_photos: no read without a session ────────────────────────────
-- Who: any signed-in session, same visibility rule as before (community, own,
-- or a friend's 'friends' photo). anon no longer reads rows (person_id,
-- storage_path) or files. The app only reads these signed in (lib/social.ts).
drop policy if exists "read permitted visit photos" on visit_photos;
create policy "read permitted visit photos" on visit_photos for select to authenticated using (
  visibility = 'community'
  or exists (select 1 from people owner where owner.id = person_id and owner.auth_user_id = (select auth.uid()))
  or (
    visibility = 'friends' and exists (
      select 1 from people owner
      join friendships f on f.person_id = owner.id
      join people viewer on viewer.id = f.friend_id
      where owner.id = person_id and viewer.auth_user_id = (select auth.uid())
    )
  )
);
drop policy if exists "read permitted visit photo files" on storage.objects;
create policy "read permitted visit photo files" on storage.objects for select to authenticated
  using (bucket_id = 'visit-photos' and exists (
    select 1 from public.visit_photos photo where photo.storage_path = name
  ));

commit;
