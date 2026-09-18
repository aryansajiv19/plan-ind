-- Migration 060 — delete my account (C3). Apply after 059. STAGED.
--
-- Three parts: the spots ownership change the owner chose (option ii), one
-- additive storage policy so a user can list their own files, and the
-- delete_my_account() RPC.
--
-- Result codes: deleted | storage_remaining | ready | cannot_delete_login.
-- (ready/cannot_delete_login only from the p_probe call the route makes first.)
-- Not signed in raises 42501, as everywhere else.
--
-- ── Order of operations (the part that matters) ───────────────────────────
-- The route calls this function with p_probe first, BEFORE touching any photo:
-- deleting a photo cannot be undone, so the one thing that must not happen is
-- destroying them and then finding the login cannot be removed. Then it deletes
-- the user's storage objects with the user's own session and confirms by
-- listing (a refused storage delete returns 200 [], so "no error" proves
-- nothing). Only then does it call this RPC for real, and that call refuses
-- with storage_remaining if any object is left — nothing is deleted in that
-- case.
-- Everything this RPC does is ONE transaction ending in
-- `delete from auth.users`, so the login and the data can never be separated:
-- if the auth delete fails, the whole thing rolls back and the user keeps both
-- and can retry. The one non-atomic seam is storage-then-RPC: photos gone,
-- data intact, retry completes it. That is the failure we want, not its
-- opposite.
--
-- ── Why votes/rsvps/ratings are handled explicitly ───────────────────────
-- Their user_id FK is `on delete set null`, so a bare auth delete would leave
-- rows with a name and a participant_token_hash and no user_id — exactly the
-- legacy class anyone can claim by hash (tracked as 053's must-fix). So this
-- function empties or anonymises them BEFORE the auth delete, and nulls the
-- hash so what remains cannot be claimed.
--   open plans    : the user's votes are deleted (an undecided tally must not
--                   count someone who is gone).
--   decided plans : votes stay, because the shown tally must keep matching the
--                   winner, with voter_name 'Former member', hash and user_id
--                   null. The unique index is on the hash, and nulls are
--                   distinct, so several deleted accounts on one plan are fine.
-- RSVPs and ratings are always deleted: attendance and a rating are personal,
-- and nothing downstream needs them to add up.
-- Legacy rows (user_id already null) cannot be attributed to anyone and are
-- left alone, here as in 052/056.
--
-- ── Hosted plans: owner's choice B ───────────────────────────────────────
-- Hosted OPEN plans are deleted (nothing was decided, nothing happened).
-- Hosted DECIDED plans with another member are KEPT as a read-only record:
-- created_by_user_id goes null via the FK and the host token row is deleted, so
-- nobody can run a host command on them again. A hosted plan nobody else
-- joined is deleted whatever its status.
--
-- ── Custom spots: owner's choice (ii) ────────────────────────────────────
-- spots.created_by_user_id cascaded, which would have deleted other people's
-- votes, plan rounds and visits pointing at a shared custom spot -- and a spot
-- that won a decided plan would have blocked the whole account delete on
-- plans.winner_spot_id (no ON DELETE action). The FK becomes `set null`, so a
-- referenced custom spot survives as ownerless community data, and this
-- function deletes the user's custom spots that nothing else points at.
-- spots_custom_owner_check ("a custom spot has an owner") is replaced by the
-- same rule applied only to new rows, via a trigger: the CHECK could not tell
-- an insert from an owner leaving. Live has 0 custom spots today, so nothing
-- is being rewritten here.
--
-- ── booking_owner ────────────────────────────────────────────────────────
-- It is a typed name, not a reference. On a plan where this user's OWN RSVP
-- name on THAT plan is the booking_owner, and nothing is booked yet, it becomes
-- 'Former member' so the plan doesn't name a deleted account. Correlating name
-- to plan is the point (review, Medium): matching every name the user ever
-- used anywhere would rename a different member who shares it, and would let
-- someone copy another plan's booking_owner into a throwaway plan of their own
-- and wipe it by deleting their account. `booked is true` is left alone, as in
-- leave_plan: the reservation exists in the real world.

begin;

-- 1. spots: ownerless custom spots become legal, enforced on insert only.
alter table spots drop constraint if exists spots_custom_owner_check;

create or replace function spots_require_owner_on_insert()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.source <> 'curated' and new.created_by_user_id is null then
    raise exception 'A custom spot needs an owner' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists spots_require_owner on spots;
create trigger spots_require_owner before insert on spots
  for each row execute function spots_require_owner_on_insert();

do $$
declare
  fk text;
begin
  select conname into fk from pg_constraint
  where conrelid = 'public.spots'::regclass and contype = 'f'
    and conkey::smallint[] = array[(select attnum from pg_attribute
                        where attrelid = 'public.spots'::regclass
                          and attname = 'created_by_user_id')];
  if fk is not null then
    execute format('alter table spots drop constraint %I', fk);
  end if;
  alter table spots add constraint spots_created_by_user_id_fkey
    foreign key (created_by_user_id) references auth.users(id) on delete set null;
end;
$$;

-- 2. storage: a user can already delete their own files (policy from 010), but
-- could only SELECT the ones with a visit_photos row. An upload that failed
-- half way is invisible to its owner and so undeletable by them, and the
-- Storage API's delete returns 200 [] for it. Own files are now listable.
drop policy if exists "read own visit photo files" on storage.objects;
create policy "read own visit photo files" on storage.objects for select to authenticated
  using (bucket_id = 'visit-photos' and owner_id = (select auth.uid())::text);

-- 3. the RPC.
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
  update plans p set booking_owner = 'Former member'
  where p.booked is not true
    and exists (select 1 from rsvps r
                where r.plan_id = p.id and r.user_id = uid
                  and r.voter_name = p.booking_owner);

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

commit;
