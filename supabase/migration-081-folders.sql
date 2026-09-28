-- Migration 081: folders that group an account's lists.
--
-- STAGED -- written, not applied anywhere. Apply only with the owner's
-- approval (after the security review), then record it in worklog.md the same day.
--
-- One folders table and a nullable folder_id on the three kinds of list:
-- Been collections (visit_collections), moodboards, and saved-link lists
-- (place_collections, filed per list, not per link). A list sits in at most
-- one folder; folders don't nest.
--
-- Same owner, enforced by the database: each folder_id is a composite FK
-- (folder_id, person_id) -> folders(id, person_id), so a list can only be
-- filed in a folder its own owner holds. Deleting a folder un-files its
-- lists (ON DELETE SET NULL (folder_id), PG15+) and never deletes them.
--
-- Folders are private: owner-only RLS, the same people-join pattern the three
-- list tables use, even when a moodboard inside one is shared with friends.
-- Not in the Realtime publication. Not built: nesting, sharing, ordering, a
-- per-account cap (the same as the other unbounded lists already recorded).

begin;

create table if not exists folders (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references people(id) on delete cascade,
  -- Refused rather than rewritten: clean_app_text (020/068) drops control
  -- and bidi characters and trims, so a name must already be clean.
  name       text not null check (char_length(name) between 1 and 40 and name = clean_app_text(name, 40)),
  -- people.emoji's bounds (1-8 characters, no controls or bidi marks).
  emoji      text not null default '📁' check (
    char_length(emoji) between 1 and 8
    and emoji !~ '[[:cntrl:]]'
    and emoji !~ ('[' || chr(8206) || chr(8207) || chr(8234) || '-' || chr(8238) || chr(8294) || '-' || chr(8297) || ']')
  ),
  created_at timestamptz not null default now(),
  unique (id, person_id)
);
create unique index if not exists folders_name_ci_idx on folders (person_id, lower(name));
alter table folders enable row level security;

drop policy if exists "manage own folders" on folders;
create policy "manage own folders" on folders for all to authenticated
  using (exists (select 1 from people p where p.id = person_id and p.auth_user_id = (select auth.uid())))
  with check (exists (select 1 from people p where p.id = person_id and p.auth_user_id = (select auth.uid())));
revoke all on table folders from anon;

alter table visit_collections add column if not exists folder_id uuid;
alter table moodboards        add column if not exists folder_id uuid;
alter table place_collections add column if not exists folder_id uuid;

alter table visit_collections drop constraint if exists visit_collections_folder_fk;
alter table visit_collections add constraint visit_collections_folder_fk
  foreign key (folder_id, person_id) references folders (id, person_id) on delete set null (folder_id);
alter table moodboards drop constraint if exists moodboards_folder_fk;
alter table moodboards add constraint moodboards_folder_fk
  foreign key (folder_id, person_id) references folders (id, person_id) on delete set null (folder_id);
alter table place_collections drop constraint if exists place_collections_folder_fk;
alter table place_collections add constraint place_collections_folder_fk
  foreign key (folder_id, person_id) references folders (id, person_id) on delete set null (folder_id);

create index if not exists visit_collections_folder_idx on visit_collections (folder_id) where folder_id is not null;
create index if not exists moodboards_folder_idx        on moodboards (folder_id) where folder_id is not null;
create index if not exists place_collections_folder_idx on place_collections (folder_id) where folder_id is not null;

commit;
