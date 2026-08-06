-- Migration 007 — Supabase Auth ownership and social-write RLS.
--
-- ADDITIVE / SAFE TO RE-RUN. Apply after 005 and 006. Shared plan reads,
-- voting, RSVPs, and ratings remain public so existing group links keep
-- working. Identity-backed social writes now require an authenticated user.

-- Bind the pre-existing upgrade seam to Supabase Auth.
alter table people drop constraint if exists people_auth_user_id_fkey;
alter table people
  add constraint people_auth_user_id_fkey
  foreign key (auth_user_id) references auth.users(id) on delete cascade;

-- Identity columns are server-derived for authenticated inserts and pinned
-- on updates. Anonymous callers can no longer create or mutate profiles once
-- the policies below are installed.
create or replace function people_before_write() returns trigger
language plpgsql as $$
begin
  new.display_name := trim(new.display_name);
  new.emoji        := trim(new.emoji);
  new.color        := lower(trim(new.color));

  if current_user = 'anon' then
    if tg_op = 'INSERT' then
      new.auth_user_id := null;
    else
      new.id           := old.id;
      new.auth_user_id := old.auth_user_id;
    end if;
  elsif current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      new.id           := auth.uid();
      new.auth_user_id := auth.uid();
    else
      new.id           := old.id;
      new.auth_user_id := old.auth_user_id;
    end if;
  end if;

  return new;
end $$;

-- Create the user's profile exactly once. Legacy device profile fields may
-- seed appearance, but the old public UUID is deliberately not claimed:
-- possession of a public profile link is not proof of ownership.
create or replace function ensure_authenticated_profile(
  p_display_name text,
  p_emoji text default '🙂',
  p_color text default '#6b34e0'
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  user_id uuid := auth.uid();
  profile_id uuid;
  safe_name text := left(coalesce(nullif(trim(p_display_name), ''), 'Friend'), 40);
  safe_emoji text := left(coalesce(nullif(trim(p_emoji), ''), '🙂'), 8);
  safe_color text := lower(coalesce(nullif(trim(p_color), ''), '#6b34e0'));
begin
  if user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select id into profile_id from people where auth_user_id = user_id;
  if profile_id is not null then
    return profile_id;
  end if;

  insert into people (id, display_name, emoji, color, auth_user_id)
  values (user_id, safe_name, safe_emoji, safe_color, user_id)
  on conflict (auth_user_id) do update
    set auth_user_id = excluded.auth_user_id
  returning id into profile_id;

  return profile_id;
end $$;

revoke all on function ensure_authenticated_profile(text, text, text) from public;
grant execute on function ensure_authenticated_profile(text, text, text) to authenticated;

-- The reverse friendship edge is a database invariant. Run the mirror as the
-- function owner so an authorized write of A→B can create/delete B→A without
-- pretending that B initiated a separate client request.
create or replace function mirror_friendship() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into friendships (person_id, friend_id)
    values (new.friend_id, new.person_id)
    on conflict do nothing;
    return new;
  else
    delete from friendships
    where person_id = old.friend_id and friend_id = old.person_id;
    return old;
  end if;
end $$;

-- Public reads remain intentional. All social mutations are owner-scoped.
drop policy if exists "read people" on people;
drop policy if exists "create people" on people;
drop policy if exists "update people" on people;
drop policy if exists "create own profile" on people;
drop policy if exists "update own profile" on people;
create policy "read people" on people for select to anon, authenticated using (true);
create policy "create own profile" on people for insert to authenticated
  with check (id = (select auth.uid()) and auth_user_id = (select auth.uid()));
create policy "update own profile" on people for update to authenticated
  using (auth_user_id = (select auth.uid()))
  with check (auth_user_id = (select auth.uid()));

drop policy if exists "read friendships" on friendships;
drop policy if exists "add friendships" on friendships;
drop policy if exists "remove friendships" on friendships;
drop policy if exists "add own friendships" on friendships;
drop policy if exists "remove own friendships" on friendships;
create policy "read friendships" on friendships for select to anon, authenticated using (true);
create policy "add own friendships" on friendships for insert to authenticated
  with check (exists (
    select 1 from people p
    where p.id = person_id and p.auth_user_id = (select auth.uid())
  ));
create policy "remove own friendships" on friendships for delete to authenticated
  using (exists (
    select 1 from people p
    where p.id = person_id and p.auth_user_id = (select auth.uid())
  ));

drop policy if exists "read visits" on visits;
drop policy if exists "log visits" on visits;
drop policy if exists "delete visits" on visits;
drop policy if exists "log own visits" on visits;
drop policy if exists "delete own visits" on visits;
create policy "read visits" on visits for select to anon, authenticated using (true);
create policy "log own visits" on visits for insert to authenticated
  with check (exists (
    select 1 from people p
    where p.id = person_id and p.auth_user_id = (select auth.uid())
  ));
create policy "delete own visits" on visits for delete to authenticated
  using (exists (
    select 1 from people p
    where p.id = person_id and p.auth_user_id = (select auth.uid())
  ));

drop policy if exists "read companions" on visit_companions;
drop policy if exists "tag companions" on visit_companions;
drop policy if exists "untag companions" on visit_companions;
drop policy if exists "tag own visit companions" on visit_companions;
drop policy if exists "untag own visit companions" on visit_companions;
create policy "read companions" on visit_companions for select to anon, authenticated using (true);
create policy "tag own visit companions" on visit_companions for insert to authenticated
  with check (exists (
    select 1
    from visits v
    join people p on p.id = v.person_id
    where v.id = visit_id and p.auth_user_id = (select auth.uid())
  ));
create policy "untag own visit companions" on visit_companions for delete to authenticated
  using (exists (
    select 1
    from visits v
    join people p on p.id = v.person_id
    where v.id = visit_id and p.auth_user_id = (select auth.uid())
  ));
