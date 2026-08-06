-- Budget/location-aware plans plus personal visit collections and photos.
-- Apply after migration 009. Additive and safe to re-run.

alter table plans add column if not exists budget_per_person int;
alter table plans add column if not exists origin_label text;
alter table plans add column if not exists origin_latitude double precision;
alter table plans add column if not exists origin_longitude double precision;
alter table plans add column if not exists radius_km int;

alter table plans drop constraint if exists plans_budget_per_person_check;
alter table plans add constraint plans_budget_per_person_check
  check (budget_per_person is null or budget_per_person between 0 and 10000);
alter table plans drop constraint if exists plans_radius_km_check;
alter table plans add constraint plans_radius_km_check
  check (radius_km is null or radius_km between 1 and 500);

create table if not exists visit_collections (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references people(id) on delete cascade,
  name       text not null check (char_length(trim(name)) between 1 and 40),
  created_at timestamptz not null default now()
);
create unique index if not exists visit_collections_name_ci_idx
  on visit_collections (person_id, lower(trim(name)));

create table if not exists visit_collection_items (
  collection_id uuid not null references visit_collections(id) on delete cascade,
  visit_id      uuid not null references visits(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (collection_id, visit_id)
);
create index if not exists visit_collection_items_visit_idx
  on visit_collection_items (visit_id);

create table if not exists visit_photos (
  id           uuid primary key default gen_random_uuid(),
  visit_id     uuid not null references visits(id) on delete cascade,
  person_id    uuid not null references people(id) on delete cascade,
  storage_path text not null unique,
  caption      text check (caption is null or char_length(caption) <= 160),
  visibility   text not null default 'friends' check (visibility in ('private', 'friends', 'community')),
  created_at   timestamptz not null default now()
);
create index if not exists visit_photos_visit_idx on visit_photos (visit_id, created_at);
create index if not exists visit_photos_person_idx on visit_photos (person_id, created_at desc);

alter table visit_collections enable row level security;
alter table visit_collection_items enable row level security;
alter table visit_photos enable row level security;

drop policy if exists "manage own visit collections" on visit_collections;
create policy "manage own visit collections" on visit_collections for all to authenticated
  using (exists (select 1 from people p where p.id = person_id and p.auth_user_id = (select auth.uid())))
  with check (exists (select 1 from people p where p.id = person_id and p.auth_user_id = (select auth.uid())));

drop policy if exists "manage own visit collection items" on visit_collection_items;
create policy "manage own visit collection items" on visit_collection_items for all to authenticated
  using (exists (
    select 1 from visit_collections c join people p on p.id = c.person_id
    where c.id = collection_id and p.auth_user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from visit_collections c
    join visits v on v.id = visit_id and v.person_id = c.person_id
    join people p on p.id = c.person_id
    where c.id = collection_id and p.auth_user_id = (select auth.uid())
  ));

drop policy if exists "read permitted visit photos" on visit_photos;
create policy "read permitted visit photos" on visit_photos for select to anon, authenticated using (
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

drop policy if exists "manage own visit photos" on visit_photos;
create policy "manage own visit photos" on visit_photos for all to authenticated
  using (exists (select 1 from people p where p.id = person_id and p.auth_user_id = (select auth.uid())))
  with check (
    exists (select 1 from people p where p.id = person_id and p.auth_user_id = (select auth.uid()))
    and exists (select 1 from visits v where v.id = visit_id and v.person_id = visit_photos.person_id)
  );

insert into storage.buckets (id, name, public)
values ('visit-photos', 'visit-photos', false)
on conflict (id) do nothing;

drop policy if exists "read permitted visit photo files" on storage.objects;
create policy "read permitted visit photo files" on storage.objects for select to anon, authenticated
  using (bucket_id = 'visit-photos' and exists (
    select 1 from public.visit_photos photo where photo.storage_path = name
  ));
drop policy if exists "upload own visit photos" on storage.objects;
create policy "upload own visit photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'visit-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "manage own visit photo files" on storage.objects;
create policy "manage own visit photo files" on storage.objects for update to authenticated
  using (bucket_id = 'visit-photos' and owner_id = (select auth.uid())::text)
  with check (bucket_id = 'visit-photos' and owner_id = (select auth.uid())::text);
drop policy if exists "delete own visit photo files" on storage.objects;
create policy "delete own visit photo files" on storage.objects for delete to authenticated
  using (bucket_id = 'visit-photos' and owner_id = (select auth.uid())::text);
