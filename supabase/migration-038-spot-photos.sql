-- Migration 038: photo provenance columns + the public `spot-photos` bucket.
--
-- All 82 curated spots have a null photo_url, so PhotoTile and the place
-- cards permanently render their no-photo fallback and WinnerPhotoReveal --
-- which is gated on a photo existing -- has never run in production. A
-- visual app about venues is showing zero venues.
--
-- ── Why a separate PUBLIC bucket, not visit-photos ───────────────────────
--
-- `visit-photos` is private and works because the CALLER owns the row and
-- signs a URL with their own session (lib/social.ts). Neither half of that
-- transfers here. These are catalogue images: there is no owning user, the
-- write is a one-time admin backfill performed out-of-band, and every
-- visitor loads them on every card -- so an expiring signed URL is exactly
-- the wrong shape. Hence public-read.
--
-- Public-read is NOT public-write. The policies below grant `select` to
-- anon/authenticated and grant insert/update/delete to NOBODY, so there is
-- no user-facing write path into this bucket by construction rather than by
-- omission: adding one would require adding a policy, which is a visible
-- change, not an oversight. Writes happen through the service role only
-- (scripts/backfill-spot-photos.mjs), which bypasses RLS by design.
--
-- ── Why provenance is two columns, not a boolean ─────────────────────────
--
-- `photo_source` distinguishes claims that are not interchangeable: a photo
-- from the venue's own site IS that venue; a Wikimedia image of a landmark
-- usually is; a stock category image is NOT -- it merely looks like one. A
-- wrong photo is worse than no photo precisely because it asserts something
-- false at a glance, on the card, where a missing one merely leaves a gap.
--
-- `photo_attribution` is a LEGAL requirement, not metadata hygiene. The
-- Wikimedia images this lands under CC licences that vary per file, and
-- several require credit on display. An unattributed CC image is a licence
-- breach, so:
--
--   ⚠ CONSUMER SIDE, NOT BUILT HERE: whatever renders spots.photo_url MUST
--   render photo_attribution alongside it whenever that column is non-null.
--   Today that means PhotoTile, the place/option cards, DecidedPlan and
--   WinnerPhotoReveal. A column nobody displays satisfies no licence. The
--   backfill deliberately stores attribution for every non-venue-sourced
--   image so the obligation is visible in the data rather than remembered.
--
-- ── Reversibility ────────────────────────────────────────────────────────
--
-- Every photo lands via its own guarded UPDATE keyed by spot id (migration
-- 039), so a single bad one is removed by nulling that row's three columns
-- and deleting one object -- no re-run, no cascade. Across 82 hand-reviewed
-- venues some will still be wrong; make the wrong ones cheap to remove.

alter table public.spots
  add column if not exists photo_source text
    check (photo_source is null or photo_source in ('venue_site', 'wikimedia', 'stock')),
  add column if not exists photo_attribution text
    check (photo_attribution is null or char_length(photo_attribution) <= 300);

-- A photo from a source that needs crediting must carry its credit. Venue
-- sites don't (it's their own image, used to represent them); Wikimedia and
-- stock do. Enforced here so an un-credited CC image cannot be inserted at
-- all, rather than relying on the backfill script remembering.
alter table public.spots
  drop constraint if exists spots_photo_attribution_required;
alter table public.spots
  add constraint spots_photo_attribution_required check (
    photo_source is null
    or photo_source = 'venue_site'
    or photo_attribution is not null
  );

-- Provenance only means something next to an actual photo.
alter table public.spots
  drop constraint if exists spots_photo_source_needs_photo;
alter table public.spots
  add constraint spots_photo_source_needs_photo check (
    photo_source is null or photo_url is not null
  );

insert into storage.buckets (id, name, public)
values ('spot-photos', 'spot-photos', true)
on conflict (id) do update set public = true;

-- Read: everyone. These are catalogue images on a public share link.
drop policy if exists "read spot photo files" on storage.objects;
create policy "read spot photo files" on storage.objects for select to anon, authenticated
  using (bucket_id = 'spot-photos');

-- Write: nobody. Stated as explicit always-false policies rather than by
-- leaving them out, so the intent is legible to the next reader and a
-- future "just add an upload policy" has to argue with this comment first.
-- The service role bypasses RLS and is how the backfill writes.
drop policy if exists "no client writes to spot photos" on storage.objects;
create policy "no client writes to spot photos" on storage.objects for insert to anon, authenticated
  with check (bucket_id <> 'spot-photos');
drop policy if exists "no client updates to spot photos" on storage.objects;
create policy "no client updates to spot photos" on storage.objects for update to anon, authenticated
  using (bucket_id <> 'spot-photos');
drop policy if exists "no client deletes of spot photos" on storage.objects;
create policy "no client deletes of spot photos" on storage.objects for delete to anon, authenticated
  using (bucket_id <> 'spot-photos');
