-- Migration 068: data hygiene. STAGED -- written, not applied anywhere.
-- Applies after 064 (independent of 067). Security review 2026-09-26,
-- findings file items R4, R9, R18, C1.
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

-- ── C1: a per-account cap on visit-photo files ─────────────────────────────
-- Nothing bounded how many files one account could put in visit-photos, and
-- a file with no visit_photos row shows nowhere and is never cleaned up. 200
-- files per account (8MB each at most, the bucket's limit) is far above any
-- real use. Counted by a definer function: the storage read policy hides
-- files with no visit_photos row -- exactly the orphans this cap is for.
-- ponytail: count checked per upload, so a burst of parallel uploads can
-- overshoot by the burst size; a hard cap would need a lock.
create or replace function visit_photo_upload_allowed()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select (select count(*) from storage.objects o
          where o.bucket_id = 'visit-photos' and o.owner_id = (select auth.uid())::text) < 200
$$;
revoke all on function visit_photo_upload_allowed() from public, anon, authenticated;
grant execute on function visit_photo_upload_allowed() to authenticated;

-- Restrictive: ANDed with "upload own visit photos"; other buckets unaffected.
drop policy if exists "cap visit photo uploads" on storage.objects;
create policy "cap visit photo uploads" on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'visit-photos' or public.visit_photo_upload_allowed());
