-- Social link intake and personal place lists. This stores source links and
-- resolution results without requiring the client to scrape third party pages.
-- Apply after migration 011. Additive and safe to re-run.

create table if not exists place_collections (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references people(id) on delete cascade,
  name       text not null check (char_length(trim(name)) between 1 and 40),
  kind       text not null default 'custom' check (kind in ('want_to_try', 'planning', 'custom')),
  created_at timestamptz not null default now()
);
create unique index if not exists place_collections_name_ci_idx
  on place_collections (person_id, lower(trim(name)));
create unique index if not exists place_collections_system_kind_idx
  on place_collections (person_id, kind) where kind <> 'custom';

create table if not exists place_imports (
  id               uuid primary key default gen_random_uuid(),
  person_id        uuid not null references people(id) on delete cascade,
  source_url       text not null check (char_length(source_url) between 8 and 2048),
  normalized_url   text not null check (char_length(normalized_url) between 8 and 2048),
  provider         text not null check (provider in ('instagram', 'tiktok', 'facebook', 'reddit', 'youtube', 'web')),
  status           text not null default 'pending' check (status in ('pending', 'resolving', 'resolved', 'needs_input', 'failed')),
  resolved_spot_id uuid references spots(id) on delete set null,
  extracted_data   jsonb not null default '{}'::jsonb,
  error_code       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (person_id, normalized_url)
);
create index if not exists place_imports_person_idx on place_imports (person_id, created_at desc);
create index if not exists place_imports_status_idx on place_imports (status, created_at) where status <> 'resolved';

create table if not exists place_collection_items (
  id            uuid primary key default gen_random_uuid(),
  collection_id uuid not null references place_collections(id) on delete cascade,
  spot_id       uuid references spots(id) on delete cascade,
  import_id     uuid references place_imports(id) on delete cascade,
  note          text check (note is null or char_length(note) <= 280),
  created_at    timestamptz not null default now(),
  constraint place_collection_items_one_source check (
    (spot_id is not null and import_id is null) or (spot_id is null and import_id is not null)
  )
);
create unique index if not exists place_collection_items_spot_idx
  on place_collection_items (collection_id, spot_id) where spot_id is not null;
create unique index if not exists place_collection_items_import_idx
  on place_collection_items (collection_id, import_id) where import_id is not null;

create or replace function ensure_default_place_collections(profile_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into place_collections (person_id, name, kind)
  values (profile_id, 'Want to try', 'want_to_try'), (profile_id, 'Planning', 'planning')
  on conflict do nothing;
end $$;
revoke all on function ensure_default_place_collections(uuid) from public;

do $$ declare profile record;
begin
  for profile in select id from people loop
    perform ensure_default_place_collections(profile.id);
  end loop;
end $$;

create or replace function people_default_place_collections() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform ensure_default_place_collections(new.id);
  return new;
end $$;
drop trigger if exists people_default_place_collections_after_insert on people;
create trigger people_default_place_collections_after_insert
  after insert on people for each row execute function people_default_place_collections();

alter table place_collections enable row level security;
alter table place_imports enable row level security;
alter table place_collection_items enable row level security;

drop policy if exists "manage own place collections" on place_collections;
create policy "manage own place collections" on place_collections for all to authenticated
  using (exists (select 1 from people p where p.id = person_id and p.auth_user_id = (select auth.uid())))
  with check (exists (select 1 from people p where p.id = person_id and p.auth_user_id = (select auth.uid())));

drop policy if exists "manage own place imports" on place_imports;
create policy "manage own place imports" on place_imports for all to authenticated
  using (exists (select 1 from people p where p.id = person_id and p.auth_user_id = (select auth.uid())))
  with check (exists (select 1 from people p where p.id = person_id and p.auth_user_id = (select auth.uid())));

drop policy if exists "manage own place collection items" on place_collection_items;
create policy "manage own place collection items" on place_collection_items for all to authenticated
  using (exists (
    select 1 from place_collections c join people p on p.id = c.person_id
    where c.id = collection_id and p.auth_user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from place_collections c join people p on p.id = c.person_id
    where c.id = collection_id and p.auth_user_id = (select auth.uid())
  ) and (
    import_id is null or exists (
      select 1 from place_imports i join people owner on owner.id = i.person_id
      where i.id = import_id and owner.auth_user_id = (select auth.uid())
    )
  ));
