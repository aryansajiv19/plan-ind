-- Migration 068: data hygiene. STAGED -- written, not applied anywhere.
-- Applies after 064 (independent of 067). Security review 2026-09-26,
-- findings file items R4, R9, R18, C1; batch review F1 (byte ceiling) and
-- its confirmation pass (cap enforced by a trigger on the landing write).
--
-- Before applying live, check the length caps hold on existing rows (the
-- CHECK validates, so a violating row makes the whole migration fail cleanly):
--   select id, char_length(name), char_length(area), char_length(cuisine),
--          char_length(open_till), char_length(vibe), char_length(description),
--          char_length(address)
--   from spots where source = 'custom' and (char_length(name) > 80
--     or char_length(area) > 80 or char_length(cuisine) > 40
--     or char_length(open_till) > 20 or char_length(vibe) > 280
--     or char_length(description) > 280 or char_length(address) > 300);

-- ── R4: a custom spot carries no links or photos, and bounded text ─────────
-- Any signed-in account could publish a 'community' custom spot whose
-- booking_url/photo_url point anywhere (a phishing "Book a table", a
-- tracking pixel on every Discover grid) with unbounded text. Only curated
-- rows, which no client can write, may carry them. Caps match the custom
-- place form (components/CustomPlaces.tsx) plus the fixed values it writes.
-- The app never sets these on custom rows; clear any that were written by hand.
update spots set booking_url = null, photo_url = null, photo_source = null, photo_attribution = null
where source <> 'curated'
  and (booking_url is not null or photo_url is not null or photo_source is not null or photo_attribution is not null);

alter table spots drop constraint if exists spots_custom_no_links;
alter table spots add constraint spots_custom_no_links check (
  source = 'curated'
  or (booking_url is null and photo_url is null and photo_source is null and photo_attribution is null)
);

alter table spots drop constraint if exists spots_custom_text_caps;
alter table spots add constraint spots_custom_text_caps check (
  source = 'curated' or (
    char_length(name) <= 80 and char_length(area) <= 80 and char_length(cuisine) <= 40
    and char_length(open_till) <= 20 and char_length(vibe) <= 280
    and coalesce(char_length(description), 0) <= 280 and coalesce(char_length(address), 0) <= 300
  )
);

-- Owners type these fields, and a direct insert skips the form: a CR or a
-- bidi override (U+202E) in a name reached every screen that shows it. Cleaned
-- as participant names are (clean_app_text: control characters and bidi marks
-- out, trimmed), but capped at the value's own length on purpose: over-long
-- text is still refused by spots_custom_text_caps, never silently cut. An
-- optional field that cleans to nothing becomes null; a name can't.
create or replace function sanitize_custom_spot_text()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.source <> 'curated' then
    new.name := clean_app_text(new.name, char_length(new.name));
    if new.name = '' then raise exception 'A place name is required' using errcode = '22023'; end if;
    new.area := clean_app_text(new.area, char_length(new.area));
    new.cuisine := clean_app_text(new.cuisine, char_length(new.cuisine));
    new.open_till := clean_app_text(new.open_till, char_length(new.open_till));
    new.vibe := clean_app_text(new.vibe, char_length(new.vibe));
    new.description := nullif(clean_app_text(new.description, char_length(new.description)), '');
    new.address := nullif(clean_app_text(new.address, char_length(new.address)), '');
  end if;
  return new;
end; $$;
revoke all on function sanitize_custom_spot_text() from public, anon, authenticated;
drop trigger if exists spots_sanitize_custom_text on spots;
create trigger spots_sanitize_custom_text before insert or update on spots
  for each row execute function sanitize_custom_spot_text();
-- Rows written before the trigger: an update runs each through it once. A
-- name that cleans to nothing would make that update raise and stop the
-- whole migration, so it gets a visible placeholder first.
update spots set name = 'Unnamed place'
where source <> 'curated' and clean_app_text(name, char_length(name)) = '';
update spots set name = name where source <> 'curated';

-- ── R9: a 'friends' photo is visible to the owner's friends ────────────────
-- The old branch's unqualified person_id bound to friendships.person_id, so
-- it asked whether the viewer was anyone's friend of themselves: always
-- false today, and one widened friendships policy from leaking every
-- 'friends' photo. Now the same shape as "read permitted visits". Friendships
-- are stored both ways (friendships_mirror_ins), so the viewer's own row
-- proves it. The community and own-photo branches are unchanged.
drop policy if exists "read permitted visit photos" on visit_photos;
create policy "read permitted visit photos" on visit_photos for select to authenticated using (
  visibility = 'community'
  or exists (select 1 from people owner where owner.id = person_id and owner.auth_user_id = (select auth.uid()))
  or (
    visibility = 'friends' and exists (
      select 1 from friendships f
      where f.person_id = (select auth.uid()) and f.friend_id = visit_photos.person_id
    )
  )
);

-- ── R18: the reverse-lookup indexes 065 meant to create ────────────────────
-- 065's `place_collection_items_spot_idx` collided with 012's unique
-- (collection_id, spot_id) index of that name, so IF NOT EXISTS skipped it
-- silently. New names; partial, matching the one-source check.
create index if not exists place_collection_items_spot_id_idx
  on place_collection_items (spot_id) where spot_id is not null;
create index if not exists place_collection_items_import_id_idx
  on place_collection_items (import_id) where import_id is not null;

-- ── C1 + F1: a per-account cap on visit-photo files ───────────────────────
-- Every visit-photos file must sit in its owner's folder (<uid>/...), on
-- insert and on move (confirmation pass follow-up).
--
-- Nothing bounded how much one account could put in visit-photos. Per
-- account: 200 files AND 500 MB, far above real use, counted over every file
-- the account owns -- orphans with no visit_photos row included, so they
-- stay bounded too.
--
-- Enforced by a trigger on the row write that actually lands, not by an RLS
-- policy: Storage checks RLS in a probe transaction it rolls back, then
-- writes the real row as a superuser (no RLS), so a parallel burst of
-- uploads all passed a policy check (confirmation pass on F1). A BEFORE
-- trigger fires on both writes; when the real one raises, Storage deletes the
-- uploaded file. The advisory lock per owner serialises concurrent uploads,
-- so a burst cannot overshoot. A file's own size is counted when its row
-- carries it (the real write does).
--
-- Permission, checked before choosing this: CREATE TRIGGER needs the TRIGGER
-- privilege, not ownership, and Storage's own schema migration grants ALL on
-- storage tables to postgres (supabase/storage
-- migrations/tenant/0002-storage-schema.sql: "alter default privileges in
-- schema storage grant all on tables to postgres, ..."). CREATE POLICY needs
-- ownership, which hosted projects no longer give postgres (supabase#41126),
-- hence no policy here. Before applying live, confirm:
--   select has_table_privilege('postgres', 'storage.objects', 'TRIGGER');  -- t
--
-- No SQL purge of orphan files: deleting a storage.objects row does not
-- delete the file (Supabase storage schema docs: it stays in S3 and billed),
-- and it would free the owner's quota for more. Files are removed through the
-- Storage API, as delete_my_account (060) does.
create or replace function enforce_visit_photo_quota()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  files bigint;
  bytes bigint;
begin
  if new.bucket_id is distinct from 'visit-photos' then
    return new;
  end if;
  -- A visit photo lives in its owner's own folder, on insert and on every
  -- move: "manage own visit photo files" (UPDATE) has no folder check, and a
  -- policy can't be changed without owning the table on hosted projects.
  if new.owner_id is null or (storage.foldername(new.name))[1] is distinct from new.owner_id then
    raise exception 'Visit photos belong in your own folder' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('visit-photos/' || new.owner_id));
  select count(*), coalesce(sum((o.metadata->>'size')::bigint), 0) into files, bytes
    from storage.objects o
    where o.bucket_id = 'visit-photos' and o.owner_id = new.owner_id and o.id <> new.id;
  if files + 1 > 200 or bytes + coalesce((new.metadata->>'size')::bigint, 0) > 500 * 1024 * 1024 then
    raise exception 'Photo storage limit reached for this account' using errcode = '42501';
  end if;
  return new;
end; $$;
-- A trigger function is never called directly; it fires without EXECUTE.
revoke all on function enforce_visit_photo_quota() from public, anon, authenticated;

-- create or replace (not drop + create): dropping a trigger needs ownership.
create or replace trigger visit_photo_quota
  before insert or update on storage.objects
  for each row execute function public.enforce_visit_photo_quota();
