-- Migration 036 — moodboards / moodboard_items.
-- Apply after migration 035. Additive, re-run safe.
--
-- design-system/SPECS.md §15.3: Discover's moodboard layout is ready, but
-- "this cannot be wired to real data without new tables first -- there is
-- nothing in supabase/schema.sql for it today." Cross-lane request to
-- Backend to add these tables mirroring lib/planning.ts's existing shape
-- (id/name/theme/visibility on the board; id/kind/label/note/optional
-- image+source on the item), owner-scoped RLS matching visit_collections'
-- pattern. This is that migration -- schema only, staged and unapplied like
-- every migration in this directory right now. No RPC/route work: Frontend
-- wires the real writes once this is live.
--
-- Mirrors visit_collections/visit_collection_items (schema.sql:500-515)
-- byte-for-byte in shape and RLS -- same free-form, user-named collections
-- model, not place_collections' fixed-default-pair model (moodboards have
-- no "the two you always get" concept in lib/planning.ts).
--
-- One deliberate deviation from lib/planning.ts's MoodboardItem shape:
-- `imageDataUrl` there is a raw base64 data URL, fine for a localStorage-
-- only demo, wrong for a real table (inline base64 in a text column is not
-- how this app stores real images). The real column is `storage_path`,
-- matching visit_photos.storage_path's already-established pattern for real
-- image bytes (a private Storage bucket, not inline base64). Frontend's
-- real write path uploads to Storage and stores the path here, the same
-- shape visit_photos already uses.

create table if not exists moodboards (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references people(id) on delete cascade,
  name       text not null check (char_length(trim(name)) between 1 and 40),
  theme      text check (theme is null or char_length(theme) <= 40),
  visibility text not null default 'private' check (visibility in ('private', 'friends', 'shared')),
  created_at timestamptz not null default now()
);
create unique index if not exists moodboards_name_ci_idx
  on moodboards (person_id, lower(trim(name)));

create table if not exists moodboard_items (
  id           uuid primary key default gen_random_uuid(),
  moodboard_id uuid not null references moodboards(id) on delete cascade,
  kind         text not null check (kind in ('place', 'link', 'photo')),
  label        text not null check (char_length(trim(label)) between 1 and 80),
  note         text check (note is null or char_length(note) <= 280),
  storage_path text,
  source_url   text check (source_url is null or char_length(source_url) <= 2048),
  created_at   timestamptz not null default now()
);
create index if not exists moodboard_items_moodboard_idx on moodboard_items (moodboard_id);

alter table moodboards enable row level security;
alter table moodboard_items enable row level security;

-- Owner-scoped, matches "manage own visit collections" exactly
-- (schema.sql:725-727).
drop policy if exists "manage own moodboards" on moodboards;
create policy "manage own moodboards" on moodboards for all to authenticated
  using (exists (select 1 from people p where p.id = person_id and p.auth_user_id = (select auth.uid())))
  with check (exists (select 1 from people p where p.id = person_id and p.auth_user_id = (select auth.uid())));

-- Matches "manage own visit collection items" exactly (schema.sql:729-739):
-- USING checks the board is the caller's; WITH CHECK additionally confirms
-- an item can't be attached to a board it doesn't belong to (mirrors that
-- function's visits/collection ownership pairing -- here there's no second
-- owned table to join since an item has no independent owner, so the check
-- is just "this moodboard is mine," same as USING).
drop policy if exists "manage own moodboard items" on moodboard_items;
create policy "manage own moodboard items" on moodboard_items for all to authenticated
  using (exists (
    select 1 from moodboards b join people p on p.id = b.person_id
    where b.id = moodboard_id and p.auth_user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from moodboards b join people p on p.id = b.person_id
    where b.id = moodboard_id and p.auth_user_id = (select auth.uid())
  ));
