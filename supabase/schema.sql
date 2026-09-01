-- ─────────────────────────────────────────────────────────────────
-- Dubai dinner decider — canonical schema.
-- This file is the description of the END STATE. It is NOT the way to
-- update a live database.
--
-- ⚠ DESTRUCTIVE. It drops and recreates every table. Safe to re-run for
-- *structure*; it destroys all data. There are real plans and now real
-- people/visits in the production database — running this against it wipes
-- them. Use the numbered migrations (migration-00N-*.sql) for anything
-- live; they are additive and re-run safe. Only run this file against an
-- empty/scratch project.
-- ─────────────────────────────────────────────────────────────────

-- digest() for the host-token hash comparison in execute_plan_command.
create extension if not exists pgcrypto;

-- 029: safety net captured from the live project (pre-dates this repo's
-- migration numbering) — force-enables RLS on any `public` table created
-- after this point, in case a future table forgets its own explicit
-- `enable row level security` below. Every table this file creates still
-- gets one explicitly; this only matters for a table added later by hand.
create or replace function public.rls_auto_enable()
 returns event_trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  cmd record;
begin
  for cmd in
    select *
    from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table','partitioned table')
  loop
     if cmd.schema_name is not null and cmd.schema_name in ('public') and cmd.schema_name not in ('pg_catalog','information_schema') and cmd.schema_name not like 'pg_toast%' and cmd.schema_name not like 'pg_temp%' then
      begin
        execute format('alter table if exists %s enable row level security', cmd.object_identity);
        raise log 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      exception
        when others then
          raise log 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      end;
     else
        raise log 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     end if;
  end loop;
end;
$function$;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
do $$
begin
  if not exists (select 1 from pg_event_trigger where evtname = 'ensure_rls') then
    create event trigger ensure_rls on ddl_command_end
      when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      execute function public.rls_auto_enable();
  end if;
end $$;

-- Social layer first: it references spots and plans.
drop table if exists plan_host_tokens cascade;
drop table if exists member_ages cascade;
drop table if exists place_collection_items cascade;
drop table if exists place_imports cascade;
drop table if exists place_collections cascade;
drop table if exists visit_photos cascade;
drop table if exists visit_collection_items cascade;
drop table if exists visit_collections cascade;
drop table if exists visit_companions cascade;
drop table if exists visits cascade;
drop table if exists friendships cascade;
drop table if exists people cascade;

drop table if exists ratings cascade;
drop table if exists rsvps cascade;
drop table if exists votes cascade;
drop table if exists plan_spots cascade;
drop table if exists plans cascade;
drop table if exists spots cascade;

-- Curated hangout places of any category. Pre-loaded so nobody researches.
create table spots (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    text not null default 'dinner', -- dinner | cafe | shisha | movie | ...
  minimum_age smallint not null default 0 check (minimum_age between 0 and 99),
  area        text not null,
  cuisine     text not null,            -- or a type label for non-food categories
  price_band  text not null check (price_band in ('$', '$$', '$$$')),
  min_spend   int  not null,            -- AED per person
  open_till   text not null,            -- e.g. '12am', '3am'
  vibe        text not null,
  photo_url   text,                     -- curated now; places-API-ready later
  description text,                     -- a review blurb to help people decide
  booking_url text,
  source      text not null default 'curated' check (source in ('curated', 'custom')),
  visibility  text not null default 'community' check (visibility in ('private', 'friends', 'community')),
  created_by_user_id uuid references auth.users(id) on delete cascade,
  address     text,
  latitude    double precision,
  longitude   double precision,
  constraint spots_custom_owner_check check (source = 'curated' or created_by_user_id is not null)
  ,constraint spots_mainstream_content_check check (lower(concat_ws(' ', name, cuisine, vibe, description)) !~ '(strip[[:space:]-]*club|gentlemen''s[[:space:]]+club|adult[[:space:]-]+entertainment|erotic[[:space:]]+massage|escort[[:space:]]+service|brothel|sex[[:space:]]+club|swinger[[:space:]]+club|topless[[:space:]]+bar|nude[[:space:]]+show)')
);

create index spots_owner_idx on spots (created_by_user_id) where source = 'custom';
-- 027: app/home/page.tsx's `order by name limit 120` is the one unbounded-
-- growth hot query on this table (no source/category filter, just RLS) —
-- benchmarked ~49x faster with this index at 20k rows. See migration-027.
create index spots_name_idx on spots (name);

-- A plan == one share link. The uuid IS the slug in the URL.
create table plans (
  id             uuid primary key default gen_random_uuid(),
  created_by_user_id uuid references auth.users(id) on delete set null,
  title          text not null,
  category       text not null default 'dinner',
  area           text,
  deadline       timestamptz,
  status         text not null default 'open' check (status in ('open', 'decided')),
  stage          text not null default 'final' check (stage in ('pool', 'final', 'decided')),
  pool_count     smallint not null default 1 check (pool_count between 1 and 6),
  budget_per_person int check (budget_per_person is null or budget_per_person between 0 and 10000),
  origin_label   text,
  origin_latitude double precision,
  origin_longitude double precision,
  radius_km      int check (radius_km is null or radius_km between 1 and 500),
  smart_brief    text check (smart_brief is null or char_length(smart_brief) between 8 and 600),
  vibe_preferences text[] not null default '{}' check (cardinality(vibe_preferences) <= 6),
  avoid_preferences text[] not null default '{}' check (cardinality(avoid_preferences) <= 5),
  intelligence_model text,
  winner_spot_id uuid references spots(id),
  -- the last mile: a decision becomes a real, committed event
  event_time     timestamptz,           -- when the outing actually is
  booking_owner  text,                  -- voter_name of whoever's booking
  booked         boolean not null default false,
  created_at     timestamptz not null default now()
);

-- Candidate places for a plan. New plans use three pools of three while
-- legacy plans remain a single final round.
create table plan_spots (
  plan_id     uuid not null references plans(id) on delete cascade,
  spot_id     uuid not null references spots(id) on delete cascade,
  pool_number smallint not null default 1 check (pool_number between 1 and 6),
  advanced    boolean not null default false,
  primary key (plan_id, spot_id)
);

create index plan_spots_pool_idx on plan_spots (plan_id, pool_number);

-- One row per voter choice in a pool or final. One vote per participant per
-- round is enforced by the partial unique index votes_participant_round_key
-- (below) — keyed on the participant token hash, not the typed name, so two
-- people who type the same display name don't collide.
create table votes (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references plans(id) on delete cascade,
  spot_id    uuid not null references spots(id) on delete cascade,
  voter_name text not null,
  value      boolean not null,
  phase      text not null default 'final' check (phase in ('pool', 'final')),
  pool_number smallint not null default 0 check (pool_number between 0 and 6),
  participant_token_hash text,
  created_at timestamptz not null default now()
);

create index votes_plan_idx on votes (plan_id);
create index votes_round_idx on votes (plan_id, phase, pool_number);

-- One row per (voter, plan). coming = true means "I'm actually coming".
-- Headcount (not vote count) is what the booking uses.
create table rsvps (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references plans(id) on delete cascade,
  voter_name text not null,
  coming     boolean not null default true,
  choice     text not null default 'coming' check (choice in ('coming', 'maybe', 'no')),
  participant_token_hash text,
  created_at timestamptz not null default now(),
  unique (plan_id, voter_name)
);

create index rsvps_plan_idx on rsvps (plan_id);

-- One rating per (plan, voter) after the visit: stars + "would go again?".
create table ratings (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references plans(id) on delete cascade,
  spot_id    uuid not null references spots(id) on delete cascade,
  voter_name text not null,
  stars      int  not null check (stars between 1 and 5),
  again      boolean not null,
  participant_token_hash text,
  created_at timestamptz not null default now(),
  unique (plan_id, voter_name)
);

create index ratings_plan_idx on ratings (plan_id);
create index ratings_spot_idx on ratings (spot_id);

-- ── The social layer (migration 005) ───────────────────────────────
-- A device profile, still no auth. The browser generates a uuid + display
-- name once (lib/device.ts) and upserts a row into `people`; `people.id` is
-- therefore supplied BY THE CLIENT and the default below is a safety net.
-- `auth_user_id` is the upgrade seam: adopting Supabase Auth later is a
-- backfill, not a rewrite.
--
-- This does NOT replace voter_name. votes / rsvps / ratings stay keyed by a
-- free-typed name and are untouched. The only bridge is visits.plan_id.
--
-- All three display columns are anon-writable under `update people
-- using (true)`, so every one of them is bounded and normalised in the
-- database rather than only in the client (migration 006).
create table people (
  id           uuid primary key default gen_random_uuid(), -- client-generated in practice
  display_name text not null check (char_length(trim(display_name)) between 1 and 40),
  emoji        text not null default '🙂',       -- lightweight avatar, no uploads
  color        text not null default '#6b34e0'   -- hex, matches the app palette
                 check (color ~ '^#[0-9a-fA-F]{6}$'),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- The stored value is trimmed by people_before_write() below, so this
  -- raw-length bound is the belt to that braces: "Bob" plus a thousand
  -- spaces no longer slips past the trim()-based check above.
  constraint people_display_name_len check (char_length(display_name) between 1 and 40),

  -- `emoji` was bare text. It renders in the avatar slot on every card this
  -- person appears on, so it is bounded to 1-8 characters — measured against
  -- real sequences: 🙂 = 1, 🇦🇪 = 2, 👍🏽 = 2, 1️⃣ = 3, 👨‍👩‍👧‍👦 = 7.
  constraint people_emoji_len check (char_length(emoji) between 1 and 8),

  -- ...and stripped of C0/C1 controls and the bidi overrides/isolates,
  -- which can reorder or hide the text around wherever it renders. The
  -- class is built with chr() so this file stays pure ASCII:
  --   8206 U+200E LRM, 8207 U+200F RLM,
  --   8234 U+202A..8238 U+202E (embed/override/pop),
  --   8294 U+2066..8297 U+2069 (isolates).
  -- NOT excluded, because compound emoji are built from them:
  --   8205 U+200D ZWJ, 65039 U+FE0F VS16, 8419 U+20E3 combining keycap.
  constraint people_emoji_safe check (
    emoji !~ '[[:cntrl:]]'
    and emoji !~ ('[' || chr(8206) || chr(8207)
                      || chr(8234) || '-' || chr(8238)
                      || chr(8294) || '-' || chr(8297) || ']')
  )
);

-- Normalises the writable columns, and makes the identity columns
-- (`id`, `auth_user_id`) unwritable by PostgREST clients.
--
-- RLS is row-level, not column-level, so `update people using (true)` left
-- the `unique` auth-upgrade seam writable today: anyone could squat uuids in
-- it or set it on somebody else's row, which at v2 either blocks the real
-- user's backfill with a unique violation or binds a profile to the wrong
-- identity.
--
-- This is a trigger and not `revoke update (auth_user_id) ... from anon`
-- because, measured on PostgreSQL 16: (a) revoking a column privilege
-- against a table-level grant is a silent no-op, which is exactly what
-- Supabase grants anon; (b) the correct revoke-then-column-grant form breaks
-- `on conflict (id) do update set id = excluded.id, ...`, a shape PostgREST
-- may emit for upsertMe(); (c) neither revoke form covers INSERT, so a
-- chosen auth_user_id could still burn the unique index on POST /people.
--
-- Scoped to anon/authenticated, so a v2 backfill run as the table owner is
-- unaffected. NOT security definer; it only copies OLD values forward.
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

create trigger people_before_write
  before insert or update on people
  for each row execute function people_before_write();

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
  if profile_id is not null then return profile_id; end if;
  insert into people (id, display_name, emoji, color, auth_user_id)
  values (user_id, safe_name, safe_emoji, safe_color, user_id)
  on conflict (auth_user_id) do update set auth_user_id = excluded.auth_user_id
  returning id into profile_id;
  return profile_id;
end $$;

revoke all on function ensure_authenticated_profile(text, text, text) from public;
grant execute on function ensure_authenticated_profile(text, text, text) to authenticated;

-- SYMMETRIC friendship, materialised as two directed rows (a→b and b→a),
-- kept in sync by the trigger below.
--
-- Why symmetric, not a one-directional follow: friendship is established by
-- swapping personal invite links. Opening someone's link is already a
-- two-party act, and with no auth there is nobody to "accept" a request — a
-- pending state would be theatre. The link is the handshake; both edges are
-- written at once.
--
-- Why two rows, not one canonical (least, greatest) pair: "my friends" is
-- then a single index scan on the primary key, not an OR/UNION across two
-- columns. Read path: select ... from friendships where person_id = $me.
create table friendships (
  person_id  uuid not null,
  friend_id  uuid not null,
  created_at timestamptz not null default now(),
  primary key (person_id, friend_id),
  constraint friendships_person_id_fkey foreign key (person_id)
    references people(id) on delete cascade,
  constraint friendships_friend_id_fkey foreign key (friend_id)
    references people(id) on delete cascade,
  constraint friendships_no_self check (person_id <> friend_id)
);

create index friendships_friend_idx on friendships (friend_id);

-- Mirror every insert/delete so the pair can never be half-written.
-- Terminates: the mirrored write is a no-op the second time round
-- (on conflict do nothing / 0 rows deleted), so no trigger fires again.
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

create trigger friendships_mirror_ins
  after insert on friendships
  for each row execute function mirror_friendship();

create trigger friendships_mirror_del
  after delete on friendships
  for each row execute function mirror_friendship();

-- "I went to this place." Stands alone OR originates from a decided plan.
--   plan_id is null     → logged by hand, no plan involved
--   plan_id is not null → came from a decided plan's winner_spot_id
--
-- plan_id is `on delete set null` (NOT cascade, unlike votes/rsvps/ratings)
-- on purpose: a visit is personal history that outlives the plan that
-- produced it. Deleting the plan must not erase your log.
--
-- unique (person_id, plan_id) with the default NULLS DISTINCT is load
-- bearing: it makes "log the visit for this plan" idempotently upsertable,
-- while leaving standalone visits (plan_id null) unlimited.
--
-- group_label is the "a group as well" case: name the outing/crew ("Friday
-- crew") alongside, or instead of, individual companion tags.
create table visits (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid not null references people(id) on delete cascade, -- whose log this is
  spot_id     uuid not null references spots(id) on delete cascade,
  plan_id     uuid references plans(id) on delete set null,
  visited_at  timestamptz not null default now(),
  group_label text check (group_label is null or char_length(trim(group_label)) between 1 and 40),
  note        text check (note is null or char_length(note) <= 280),
  created_at  timestamptz not null default now(),
  unique (person_id, plan_id)
);

create index visits_person_idx on visits (person_id, visited_at desc); -- profile feed
create index visits_spot_idx   on visits (spot_id, visited_at desc);   -- "who's been here"
create index visits_plan_idx   on visits (plan_id) where plan_id is not null;

-- The stored values of group_label / note were never trimmed (the CHECKs
-- above trim only to measure). Whitespace-only input now becomes NULL
-- instead of violating the CHECK and failing the whole write.
create or replace function trim_visit_text() returns trigger
language plpgsql as $$
begin
  new.group_label := nullif(trim(new.group_label), '');
  new.note        := nullif(trim(new.note), '');
  return new;
end $$;

create trigger visits_before_write
  before insert or update on visits
  for each row execute function trim_visit_text();

-- Who you went with. EXACTLY ONE of the two identity paths per row:
--   person_id set, companion_name null → a tagged profile. Renders live
--     from people.display_name, so renames propagate, and it's clickable.
--   person_id null, companion_name set → a free-typed name. The common
--     case: most companions have no profile yet. It's also how the app
--     pre-fills companions from a plan's rsvps, which only carry
--     voter_name strings.
--
-- The two unique constraints rely on NULLS DISTINCT: you can't tag the same
-- profile twice or type the same name twice, but a tagged profile (name
-- null) never collides with a typed name (person_id null).
--
-- person_id is `on delete cascade`, NOT set null: SET NULL would blank the
-- column and immediately violate the CHECK below, making it impossible to
-- delete a tagged person at all. Deleting a profile therefore removes its
-- tags from other people's visits too.
create table visit_companions (
  id             uuid primary key default gen_random_uuid(),
  visit_id       uuid not null references visits(id) on delete cascade,
  person_id      uuid references people(id) on delete cascade,
  companion_name text check (companion_name is null or char_length(trim(companion_name)) between 1 and 40),
  created_at     timestamptz not null default now(),
  constraint visit_companions_identity check (
    (person_id is not null and companion_name is null) or
    (person_id is null     and companion_name is not null)
  ),
  unique (visit_id, person_id),
  unique (visit_id, companion_name)
);

create index visit_companions_visit_idx  on visit_companions (visit_id);
create index visit_companions_person_idx on visit_companions (person_id)
  where person_id is not null; -- "visits I was tagged in"

-- `unique (visit_id, companion_name)` above is exact-string, and
-- normaliseCompanions() in lib/social.ts folds case only on the client — so
-- a direct PostgREST call could store "Sara", "sara" and "Sara " as three
-- companions on one visit. Trim on write, plus a case-insensitive unique
-- index. Display casing is preserved; only the uniqueness key is folded.
create or replace function trim_companion_name() returns trigger
language plpgsql as $$
begin
  new.companion_name := nullif(trim(new.companion_name), '');
  return new;
end $$;

create trigger visit_companions_before_write
  before insert or update on visit_companions
  for each row execute function trim_companion_name();

-- NULLS DISTINCT (the index default) is load bearing here exactly as it is
-- on the constraint this shadows: rows with companion_name null are tagged
-- profiles and must never collide with each other.
create unique index visit_companions_name_ci_idx
  on visit_companions (visit_id, lower(companion_name));

-- Personal, user-named folders for organizing visit history. The item table
-- is many-to-many so one visit can appear in several useful collections.
create table visit_collections (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references people(id) on delete cascade,
  name       text not null check (char_length(trim(name)) between 1 and 40),
  created_at timestamptz not null default now()
);
create unique index visit_collections_name_ci_idx
  on visit_collections (person_id, lower(trim(name)));

create table visit_collection_items (
  collection_id uuid not null references visit_collections(id) on delete cascade,
  visit_id      uuid not null references visits(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (collection_id, visit_id)
);
create index visit_collection_items_visit_idx on visit_collection_items (visit_id);

-- Photo bytes live in the private `visit-photos` Storage bucket; this table
-- owns their visit relationship, caption and audience.
create table visit_photos (
  id           uuid primary key default gen_random_uuid(),
  visit_id     uuid not null references visits(id) on delete cascade,
  person_id    uuid not null references people(id) on delete cascade,
  storage_path text not null unique,
  caption      text check (caption is null or char_length(caption) <= 160),
  visibility   text not null default 'friends' check (visibility in ('private', 'friends', 'community')),
  created_at   timestamptz not null default now()
);
create index visit_photos_visit_idx on visit_photos (visit_id, created_at);
create index visit_photos_person_idx on visit_photos (person_id, created_at desc);

-- Links discovered on social platforms enter as imports, then resolve to a
-- real spot. Lists can hold either a resolved spot or an import still waiting
-- for identification, so the user never loses the original post.
create table place_collections (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references people(id) on delete cascade,
  name       text not null check (char_length(trim(name)) between 1 and 40),
  kind       text not null default 'custom' check (kind in ('want_to_try', 'planning', 'custom')),
  created_at timestamptz not null default now()
);
create unique index place_collections_name_ci_idx on place_collections (person_id, lower(trim(name)));
create unique index place_collections_system_kind_idx on place_collections (person_id, kind) where kind <> 'custom';

create table place_imports (
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
create index place_imports_person_idx on place_imports (person_id, created_at desc);
create index place_imports_status_idx on place_imports (status, created_at) where status <> 'resolved';

create table place_collection_items (
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
create unique index place_collection_items_spot_idx on place_collection_items (collection_id, spot_id) where spot_id is not null;
create unique index place_collection_items_import_idx on place_collection_items (collection_id, import_id) where import_id is not null;

create or replace function ensure_default_place_collections(profile_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into place_collections (person_id, name, kind)
  values (profile_id, 'Want to try', 'want_to_try'), (profile_id, 'Planning', 'planning')
  on conflict do nothing;
end $$;
revoke all on function ensure_default_place_collections(uuid) from public;

create or replace function people_default_place_collections() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform ensure_default_place_collections(new.id);
  return new;
end $$;
create trigger people_default_place_collections_after_insert
  after insert on people for each row execute function people_default_place_collections();

-- ── Row Level Security ─────────────────────────────────────────────
-- No auth in v1. Access is "you have the link." We turn RLS on so the
-- database isn't wide open by default, then grant exactly what the loop
-- needs to the anon role. Tradeoff: anyone with the anon key can write
-- votes and flip a plan's status. Acceptable for an MVP link-shared app;
-- v2 tightens this by moving writes behind an edge function.

alter table spots      enable row level security;
alter table plans      enable row level security;
alter table plan_spots enable row level security;
alter table votes      enable row level security;
alter table rsvps      enable row level security;
alter table ratings    enable row level security;

alter table people           enable row level security;
alter table friendships      enable row level security;
alter table visits           enable row level security;
alter table visit_companions enable row level security;
alter table visit_collections enable row level security;
alter table visit_collection_items enable row level security;
alter table visit_photos enable row level security;
alter table place_collections enable row level security;
alter table place_imports enable row level security;
alter table place_collection_items enable row level security;

-- Curated/community places are discoverable. A private custom place is only
-- visible to its owner or to someone holding a plan link that includes it.
create policy "read spots" on spots for select using (
  source = 'curated'
  or visibility = 'community'
  or created_by_user_id = auth.uid()
  or exists (select 1 from plan_spots ps where ps.spot_id = spots.id)
);
create policy "read plans"      on plans      for select using (true);
create policy "read plan_spots" on plan_spots for select using (true);
create policy "read votes"      on votes      for select using (true);
create policy "read rsvps"      on rsvps      for select using (true);
create policy "read ratings"    on ratings    for select using (true);

-- Tallies stay public — everyone holding the link watches the same board.
-- WRITES DO NOT. There is deliberately no insert/update/delete policy on
-- votes, rsvps or ratings: migration 018 replaced them with the
-- security-definer RPCs defined at the bottom of this file, which bind each
-- row to a participant token and validate it against the plan. Adding a
-- direct write policy here would reopen that hole.

-- Starting a plan (used by the create flow) + "decide for us" updates.
create policy "create own plans" on plans for insert to authenticated with check (created_by_user_id = (select auth.uid()));
create policy "update own plans" on plans for update to authenticated
  using (created_by_user_id = (select auth.uid()))
  with check (created_by_user_id = (select auth.uid()));
create policy "attach own plan_spots" on plan_spots for insert to authenticated with check (exists (select 1 from plans p where p.id = plan_id and p.created_by_user_id = (select auth.uid())));

-- Signed-in members can maintain their own saved custom-place library.
create policy "create custom spots" on spots for insert with check (
  source = 'custom' and created_by_user_id = auth.uid()
);
create policy "update own custom spots" on spots for update
  using (source = 'custom' and created_by_user_id = auth.uid())
  with check (source = 'custom' and created_by_user_id = auth.uid());
create policy "delete own custom spots" on spots for delete
  using (source = 'custom' and created_by_user_id = auth.uid());


-- ── Social layer policies (migration 005) ──────────────────────────
-- Same posture as above: using (true) / with check (true). Not tightened,
-- not loosened. Each grant states who can now do what.
--
-- ⚠ WHERE THIS REACHES FURTHER THAN "YOU HAVE THE LINK" — for `security`:
--  1. `people` insert/update are unrestricted. Anyone holding the anon key
--     (public by design) can create unlimited profiles, and can RENAME /
--     RE-EMOJI / RECOLOUR any existing person, including yours. No secret
--     is tied to a person id, so this cannot be fixed without inventing
--     auth. The user accepted "impersonable by design"; defacement of an
--     existing profile by a stranger is the sharper edge of that.
--  2. `friendships` insert lets anyone friend any two people together —
--     and because friendship is symmetric, that forces a stranger into
--     YOUR friends list, not just theirs.
--  3. The deletes below are row-unrestricted: anyone with the anon key can
--     delete ANY friendship, visit, or companion tag, not only their own.
--     Same posture as the existing "clear votes" policy, but visits are
--     durable personal history rather than in-flight plan state, so the
--     blast radius is larger.
--  4. Reads are fully public: `visits` is enumerable in bulk, not just per
--     profile link. The agreed model is "anyone with your profile link can
--     see your visits"; unfiltered select is strictly broader, because the
--     link stops being the thing you need.
--
-- NOT granted (never part of the loop, so this is not a tightening):
-- delete on `people`; update on visits / friendships / visit_companions.
-- Editing a visit = delete + re-log.
--
-- ⚠ DO NOT ADD `update on visits` WITHOUT TAKING IT BACK TO `security`.
-- PostgreSQL applies UPDATE policies to the ON CONFLICT DO UPDATE path, so
-- with no UPDATE policy an upsert on visits fails with
--   ERROR: new row violates row-level security policy (USING expression)
--          for table "visits"
-- (reproduced on PostgreSQL 16). That is why logVisit() in lib/social.ts
-- does delete-then-insert instead of `.upsert({ onConflict: ... })`.
-- Granting `update on visits using (true)` would fix the upsert AND let any
-- holder of the public anon key silently rewrite the contents of anyone's
-- visit log in place. Deletion is already possible and is at least visible;
-- silent content forgery on durable personal history is not.
--
-- Note also that `people`'s identity columns are NOT protected by policy —
-- RLS is row-level. `people_before_write()` above is what makes `id` and
-- `auth_user_id` unwritable by anon.

create policy "read people" on people for select to anon, authenticated using (true);
create policy "create own profile" on people for insert to authenticated
  with check (id = (select auth.uid()) and auth_user_id = (select auth.uid()));
create policy "update own profile" on people for update to authenticated
  using (auth_user_id = (select auth.uid())) with check (auth_user_id = (select auth.uid()));

create policy "read friendships" on friendships for select to anon, authenticated using (true);
create policy "add own friendships" on friendships for insert to authenticated
  with check (exists (select 1 from people p where p.id = person_id and p.auth_user_id = (select auth.uid())));
create policy "remove own friendships" on friendships for delete to authenticated
  using (exists (select 1 from people p where p.id = person_id and p.auth_user_id = (select auth.uid())));

create policy "read visits" on visits for select to anon, authenticated using (true);
create policy "log own visits" on visits for insert to authenticated
  with check (exists (select 1 from people p where p.id = person_id and p.auth_user_id = (select auth.uid())));
create policy "delete own visits" on visits for delete to authenticated
  using (exists (select 1 from people p where p.id = person_id and p.auth_user_id = (select auth.uid())));

create policy "read companions" on visit_companions for select to anon, authenticated using (true);
create policy "tag own visit companions" on visit_companions for insert to authenticated
  with check (exists (select 1 from visits v join people p on p.id = v.person_id where v.id = visit_id and p.auth_user_id = (select auth.uid())));
create policy "untag own visit companions" on visit_companions for delete to authenticated
  using (exists (select 1 from visits v join people p on p.id = v.person_id where v.id = visit_id and p.auth_user_id = (select auth.uid())));

create policy "manage own visit collections" on visit_collections for all to authenticated
  using (exists (select 1 from people p where p.id = person_id and p.auth_user_id = (select auth.uid())))
  with check (exists (select 1 from people p where p.id = person_id and p.auth_user_id = (select auth.uid())));

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
create policy "manage own visit photos" on visit_photos for all to authenticated
  using (exists (select 1 from people p where p.id = person_id and p.auth_user_id = (select auth.uid())))
  with check (
    exists (select 1 from people p where p.id = person_id and p.auth_user_id = (select auth.uid()))
    and exists (select 1 from visits v where v.id = visit_id and v.person_id = visit_photos.person_id)
  );

insert into storage.buckets (id, name, public)
values ('visit-photos', 'visit-photos', false)
on conflict (id) do nothing;
create policy "read permitted visit photo files" on storage.objects for select to anon, authenticated
  using (bucket_id = 'visit-photos' and exists (
    select 1 from public.visit_photos photo where photo.storage_path = name
  ));
create policy "upload own visit photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'visit-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "manage own visit photo files" on storage.objects for update to authenticated
  using (bucket_id = 'visit-photos' and owner_id = (select auth.uid())::text)
  with check (bucket_id = 'visit-photos' and owner_id = (select auth.uid())::text);
create policy "delete own visit photo files" on storage.objects for delete to authenticated
  using (bucket_id = 'visit-photos' and owner_id = (select auth.uid())::text);

create policy "manage own place collections" on place_collections for all to authenticated
  using (exists (select 1 from people p where p.id = person_id and p.auth_user_id = (select auth.uid())))
  with check (exists (select 1 from people p where p.id = person_id and p.auth_user_id = (select auth.uid())));
create policy "manage own place imports" on place_imports for all to authenticated
  using (exists (select 1 from people p where p.id = person_id and p.auth_user_id = (select auth.uid())))
  with check (exists (select 1 from people p where p.id = person_id and p.auth_user_id = (select auth.uid())));
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

-- ── Realtime ───────────────────────────────────────────────────────
-- Broadcast row changes so the vote screen updates live.
alter publication supabase_realtime add table votes;
alter publication supabase_realtime add table plans;
alter publication supabase_realtime add table rsvps;
alter publication supabase_realtime add table ratings;
-- 022: plan_spots. `advanced` flips when the host advances a round, and the
-- share-link screen subscribes to that UPDATE. postgres_changes applies
-- plan_spots' own RLS per subscriber ("read accessible plan spots" =
-- membership in plan_access), so this reaches exactly the set that can
-- already SELECT the row, and plan_spots holds no secret.
alter publication supabase_realtime add table plan_spots;

-- The social tables (people, friendships, visits, visit_companions) are
-- deliberately NOT in the publication. Adding a table broadcasts its rows
-- to every anon subscriber — an access-control decision, not a perf one.
-- The vote screen needs live updates because several people act on one
-- shared screen at once; a profile feed, a friends list and a visit log are
-- read-on-open and refetch fine. Revisit only if a genuinely live shared
-- surface ships, and treat it as a security decision then.

-- ── Secrets and server-owned facts (migration 019) ─────────────────
-- Two things the client must never be able to read or forge. Both live in
-- their own table rather than as a column on a publicly readable row,
-- because `read plans` is `using (true)` and realtime broadcasts whole rows
-- — a secret column there is a secret in name only.

-- The host token proves who started a plan. Insert-only: no select, update
-- or delete policy exists, so once written it is invisible to every client
-- and only the security-definer function below can compare against it.
create table plan_host_tokens (
  plan_id    uuid primary key references plans (id) on delete cascade,
  token_hash text not null,
  created_at timestamptz not null default now()
);
alter table plan_host_tokens enable row level security;
create policy "attach host token" on plan_host_tokens for insert to authenticated
  with check (exists (
    select 1 from plans p
    where p.id = plan_id and p.created_by_user_id = (select auth.uid())
  ));

-- Date of birth drives the 13/18/21 gates, so it cannot live in auth
-- user_metadata: the browser can rewrite that with auth.updateUser({ data }),
-- which would let an account certify its own age. Readable by its owner,
-- writable only through set_birth_date, which refuses to overwrite.
create table member_ages (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  date_of_birth date not null,
  created_at    timestamptz not null default now()
);
alter table member_ages enable row level security;
create policy "read own age" on member_ages for select to authenticated
  using (user_id = (select auth.uid()));

-- Participant-token lookups: every RPC below resolves a caller by
-- (plan_id, participant_token_hash) before it writes.
-- 023: votes gets the round columns and UNIQUE — one choice per participant per
-- round is a database invariant, and cast_plan_vote upserts against it. The
-- prefix still serves the plain (plan_id, participant_token_hash) lookup.
create unique index votes_participant_round_key
  on votes (plan_id, participant_token_hash, phase, pool_number)
  where participant_token_hash is not null;
create index rsvps_participant_token_idx on rsvps (plan_id, participant_token_hash)
  where participant_token_hash is not null;
create index ratings_participant_token_idx on ratings (plan_id, participant_token_hash)
  where participant_token_hash is not null;

-- ── Write paths (migrations 015, 018, 019) ─────────────────────────
-- These functions ARE the write layer for plans, votes, rsvps and ratings.
-- The tables above grant no direct write access, so a project built from
-- this file without them can be read but never written to.
--
-- Kept verbatim in sync with
-- supabase/migration-019-secret-isolation-and-rpc-integrity.sql.
create or replace function execute_plan_command(
  p_plan_id uuid,
  p_host_token text,
  p_command text,
  p_patch jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  target plans%rowtype;
  stored_hash text;
  finalists uuid[] := '{}';
  winner uuid;
begin
  if p_host_token is null or length(p_host_token) < 32 then
    raise exception 'Invalid host token' using errcode = '42501';
  end if;

  select * into target from plans where id = p_plan_id for update;
  select token_hash into stored_hash from plan_host_tokens where plan_id = p_plan_id;
  if target.id is null or stored_hash is null
     or stored_hash <> encode(digest(p_host_token, 'sha256'), 'hex') then
    raise exception 'Host authorization required' using errcode = '42501';
  end if;

  if p_command = 'advance' then
    if target.status <> 'open' or target.stage <> 'pool' then
      raise exception 'This plan is not ready to advance';
    end if;

    with ranked as (
      select ps.pool_number, ps.spot_id,
        count(v.id) filter (where v.value) as yes_count
      from plan_spots ps
      left join votes v on v.plan_id = ps.plan_id
        and v.spot_id = ps.spot_id
        and v.phase = 'pool'
        and v.pool_number = ps.pool_number
      where ps.plan_id = p_plan_id
      group by ps.pool_number, ps.spot_id
    ), picked as (
      select distinct on (pool_number) pool_number, spot_id
      from ranked
      order by pool_number, yes_count desc, spot_id
    )
    select coalesce(array_agg(spot_id order by pool_number), '{}') into finalists from picked;

    if cardinality(finalists) <> target.pool_count then
      raise exception 'Every pool needs a candidate';
    end if;
    update plan_spots set advanced = spot_id = any(finalists) where plan_id = p_plan_id;
    update plans set stage = 'final' where id = p_plan_id;

  elsif p_command = 'decide' then
    if target.status <> 'open' or target.stage <> 'final' then
      raise exception 'This plan is not ready to decide';
    end if;

    with ranked as (
      select ps.spot_id, count(v.id) filter (where v.value) as yes_count
      from plan_spots ps
      left join votes v on v.plan_id = ps.plan_id
        and v.spot_id = ps.spot_id
        and v.phase = 'final'
        and v.pool_number = 0
      where ps.plan_id = p_plan_id and ps.advanced
      group by ps.spot_id
    )
    select spot_id into winner from ranked order by yes_count desc, spot_id limit 1;
    if winner is null then raise exception 'The final shortlist needs a vote'; end if;
    update plans set status = 'decided', stage = 'decided', winner_spot_id = winner where id = p_plan_id;

  elsif p_command = 'patch' then
    update plans set
      event_time = case when p_patch ? 'event_time' then nullif(p_patch->>'event_time', '')::timestamptz else event_time end,
      booking_owner = case when p_patch ? 'booking_owner' then nullif(left(p_patch->>'booking_owner', 80), '') else booking_owner end,
      booked = case when p_patch ? 'booked' then (p_patch->>'booked')::boolean else booked end
    where id = p_plan_id;
  else
    raise exception 'Unsupported plan command';
  end if;

  select * into target from plans where id = p_plan_id;
  return jsonb_build_object('plan', to_jsonb(target), 'winner_spot_id', target.winner_spot_id, 'finalists', finalists);
end;
$$;

-- 021: a host command now needs a session AND the 256-bit host token. Its only
-- caller (POST /api/plans/[id]/command) already 401s without a user; dropping
-- the anon grant stops a leaked token from bypassing that route entirely.
revoke all on function execute_plan_command(uuid, text, text, jsonb) from public, anon;
grant execute on function execute_plan_command(uuid, text, text, jsonb) to authenticated;

-- ── 2. Participant RPCs get relational and state validation ───────────────
--
-- Migration 018 checked the token-hash shape and nothing else: none of the
-- three functions read plans at all. A caller could vote on a spot belonging
-- to a different plan, vote after the plan was decided, rate a losing venue,
-- or register under an empty name. The token hash is a client-supplied
-- identity claim, so it was the only thing standing in the way.

-- returns jsonb (migration 023). A re-run over a database that still has the
-- pre-023 `returns void` version can't `create or replace` a new return type
-- (42P13), so drop first.
drop function if exists cast_plan_vote(uuid, uuid, text, boolean, text, smallint, text);
create function cast_plan_vote(
  p_plan_id uuid, p_spot_id uuid, p_voter_name text, p_value boolean,
  p_phase text, p_pool_number smallint, p_participant_token_hash text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target plans%rowtype;
  clean_name text := left(trim(p_voter_name), 40);
begin
  if p_participant_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Participant authorization required' using errcode = '42501';
  end if;
  if clean_name = '' then
    raise exception 'Enter a name before voting' using errcode = '22023';
  end if;
  if p_phase not in ('pool', 'final') then
    raise exception 'Unsupported voting phase' using errcode = '22023';
  end if;

  select * into target from plans where id = p_plan_id;
  if target.id is null or target.status <> 'open' then
    raise exception 'This plan is not open for voting' using errcode = '22023';
  end if;
  -- The stage gates the phase: pool votes close once the finalists are set.
  if p_phase <> target.stage then
    raise exception 'This round is no longer open' using errcode = '22023';
  end if;
  if p_phase = 'pool' and (p_pool_number < 1 or p_pool_number > target.pool_count) then
    raise exception 'That round does not exist' using errcode = '22023';
  end if;
  if p_phase = 'final' and p_pool_number <> 0 then
    raise exception 'That round does not exist' using errcode = '22023';
  end if;
  -- The spot must be a candidate on this plan, in this pool. In the final
  -- round it must additionally be one of the advanced finalists.
  if not exists (
    select 1 from plan_spots ps
    where ps.plan_id = p_plan_id and ps.spot_id = p_spot_id
      and (p_phase = 'final' or ps.pool_number = p_pool_number)
      and (p_phase = 'pool' or ps.advanced)
  ) then
    raise exception 'That place is not on this plan' using errcode = '22023';
  end if;

  -- 023: one row per (plan, participant, round), enforced by
  -- votes_participant_round_key. A concurrent call by the same participant
  -- serialises on that key and lands as DO UPDATE — never a second row that
  -- execute_plan_command would tally twice. Returns the resulting selection,
  -- byte-identical on a replayed call.
  if p_value then
    insert into votes (plan_id, spot_id, voter_name, value, phase, pool_number, participant_token_hash)
    values (p_plan_id, p_spot_id, clean_name, true, p_phase, p_pool_number, p_participant_token_hash)
    on conflict (plan_id, participant_token_hash, phase, pool_number)
      where participant_token_hash is not null
      do update set spot_id = excluded.spot_id, voter_name = excluded.voter_name, value = true;
  else
    delete from votes
      where plan_id = p_plan_id and participant_token_hash = p_participant_token_hash
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
  p_plan_id uuid, p_voter_name text, p_coming boolean, p_choice text, p_participant_token_hash text
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing rsvps%rowtype;
  target plans%rowtype;
  clean_name text := left(trim(p_voter_name), 40);
begin
  if p_participant_token_hash !~ '^[0-9a-f]{64}$' or p_choice not in ('coming', 'maybe', 'no') then
    raise exception 'Participant authorization required' using errcode = '42501';
  end if;
  if clean_name = '' then
    raise exception 'Enter a name before replying' using errcode = '22023';
  end if;

  -- RSVPs stay open after the plan is decided: that is when most people
  -- answer. Only a plan that exists is required.
  select * into target from plans where id = p_plan_id;
  if target.id is null then
    raise exception 'That plan does not exist' using errcode = '22023';
  end if;

  -- 025: loop + retry-on-unique_violation. `for update` locks nothing when
  -- the row doesn't exist yet, so two concurrent first-time RSVPs for the
  -- same name can both reach the insert; the losing one now retries into the
  -- update branch instead of surfacing a raw 23505.
  loop
    select * into existing from rsvps where plan_id = p_plan_id and voter_name = clean_name for update;
    if existing.id is not null and existing.participant_token_hash is not null
       and existing.participant_token_hash <> p_participant_token_hash then
      raise exception 'That participant name is already in use' using errcode = '42501';
    end if;
    if existing.id is null then
      begin
        insert into rsvps (plan_id, voter_name, coming, choice, participant_token_hash)
        values (p_plan_id, clean_name, p_coming, p_choice, p_participant_token_hash);
        return;
      exception when unique_violation then
      end;
    else
      update rsvps set coming = p_coming, choice = p_choice, participant_token_hash = p_participant_token_hash
        where id = existing.id;
      return;
    end if;
  end loop;
end; $$;

create or replace function rate_plan(
  p_plan_id uuid, p_spot_id uuid, p_voter_name text, p_stars integer, p_again boolean, p_participant_token_hash text
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing ratings%rowtype;
  target plans%rowtype;
  clean_name text := left(trim(p_voter_name), 40);
begin
  if p_participant_token_hash !~ '^[0-9a-f]{64}$' or p_stars not between 1 and 5 then
    raise exception 'Participant authorization required' using errcode = '42501';
  end if;
  if clean_name = '' then
    raise exception 'Enter a name before rating' using errcode = '22023';
  end if;

  -- You can only rate the place the group actually went to, and only once
  -- the plan has settled on it.
  select * into target from plans where id = p_plan_id;
  if target.id is null or target.status <> 'decided' then
    raise exception 'This plan has not been decided yet' using errcode = '22023';
  end if;
  if target.winner_spot_id is null or target.winner_spot_id <> p_spot_id then
    raise exception 'You can only rate the place the group chose' using errcode = '22023';
  end if;

  -- 025: same loop + retry-on-unique_violation as set_plan_rsvp.
  loop
    select * into existing from ratings where plan_id = p_plan_id and voter_name = clean_name for update;
    if existing.id is not null and existing.participant_token_hash is not null
       and existing.participant_token_hash <> p_participant_token_hash then
      raise exception 'That participant name is already in use' using errcode = '42501';
    end if;
    if existing.id is null then
      begin
        insert into ratings (plan_id, spot_id, voter_name, stars, again, participant_token_hash)
        values (p_plan_id, p_spot_id, clean_name, p_stars, p_again, p_participant_token_hash);
        return;
      exception when unique_violation then
      end;
    else
      update ratings set spot_id = p_spot_id, stars = p_stars, again = p_again,
        participant_token_hash = p_participant_token_hash where id = existing.id;
      return;
    end if;
  end loop;
end; $$;

revoke all on function cast_plan_vote(uuid, uuid, text, boolean, text, smallint, text) from public;
revoke all on function set_plan_rsvp(uuid, text, boolean, text, text) from public;
revoke all on function rate_plan(uuid, uuid, text, integer, boolean, text) from public;
grant execute on function cast_plan_vote(uuid, uuid, text, boolean, text, smallint, text) to anon, authenticated;
grant execute on function set_plan_rsvp(uuid, text, boolean, text, text) to anon, authenticated;
grant execute on function rate_plan(uuid, uuid, text, integer, boolean, text) to anon, authenticated;

-- ── 3. Date of birth becomes server-owned and write-once ──────────────────
--
-- DOB lived in auth user_metadata, which any signed-in browser can rewrite
-- with supabase.auth.updateUser({ data }). The 13/18/21 gates read from it,
-- so the entire age policy was self-certified by the client. Guarding the
-- server action would not have helped: that is not the writable path.

create table if not exists member_ages (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  date_of_birth date not null,
  created_at    timestamptz not null default now()
);

alter table member_ages enable row level security;

-- Readable by its owner so the app can check its own eligibility. No insert
-- or update policy at all: the only write path is set_birth_date below.
drop policy if exists "read own age" on member_ages;
create policy "read own age" on member_ages for select to authenticated
  using (user_id = (select auth.uid()));

-- Carry over anyone who already completed onboarding, so this migration does
-- not send existing accounts back through the age form.
insert into member_ages (user_id, date_of_birth)
  select id, (raw_user_meta_data->>'date_of_birth')::date
  from auth.users
  where raw_user_meta_data->>'date_of_birth' ~ '^\d{4}-\d{2}-\d{2}$'
  on conflict (user_id) do nothing;

create or replace function set_birth_date(p_date_of_birth date)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  years integer;
begin
  -- 024: is_permanent_user() too, like current_member_age. An anon→permanent
  -- upgrade keeps the uid, so an anonymous session writing this write-once row
  -- would inherit a fabricated age past the 18/21 gates.
  if uid is null or not is_permanent_user() then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  -- Write-once. A second call is an age-escalation attempt, not an edit.
  if exists (select 1 from member_ages where user_id = uid) then
    raise exception 'Your date of birth is already on file' using errcode = '42501';
  end if;
  if p_date_of_birth is null or p_date_of_birth > current_date then
    raise exception 'Enter a real date of birth' using errcode = '22023';
  end if;
  years := extract(year from age(current_date, p_date_of_birth));
  if years < 13 then
    raise exception 'Deal three is for people 13 and older' using errcode = '22023';
  end if;
  if years > 120 then
    raise exception 'Enter a real date of birth' using errcode = '22023';
  end if;
  insert into member_ages (user_id, date_of_birth) values (uid, p_date_of_birth);
end; $$;

revoke all on function set_birth_date(date) from public;
grant execute on function set_birth_date(date) to authenticated;

-- Production boundary introduced by migration 020. Kept here as the
-- canonical end state for new scratch databases.
-- Production security boundary. Apply after migration 019.
-- Existing share URLs remain valid: the UUID in /plan/:id is the capability,
-- but a browser must redeem it into an authenticated guest membership before
-- tables or Realtime will expose the plan.

create extension if not exists pgcrypto with schema extensions;

-- ── Plan capabilities ─────────────────────────────────────────────

create table if not exists plan_access (
  plan_id uuid not null references plans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (plan_id, user_id)
);
create index if not exists plan_access_user_idx on plan_access(user_id, plan_id);
alter table plan_access enable row level security;

drop policy if exists "read own plan access" on plan_access;
create policy "read own plan access" on plan_access for select to authenticated
  using (user_id = (select auth.uid()));

insert into plan_access(plan_id, user_id)
select id, created_by_user_id from plans where created_by_user_id is not null
on conflict do nothing;

create or replace function claim_plan_access(p_plan_id uuid)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not exists (select 1 from plans where id = p_plan_id) then return false; end if;
  insert into plan_access(plan_id, user_id) values (p_plan_id, uid)
  on conflict do nothing;
  return true;
end; $$;
-- 021: `from public` alone left Supabase's named anon grant in place. Share-
-- link redemption requires a session (anonymous sign-ins included, they carry
-- role `authenticated`); a keyless caller is now refused by the grant itself.
revoke all on function claim_plan_access(uuid) from public, anon;
grant execute on function claim_plan_access(uuid) to authenticated;

drop policy if exists "read plans" on plans;
drop policy if exists "read plan_spots" on plan_spots;
drop policy if exists "read votes" on votes;
drop policy if exists "read rsvps" on rsvps;
drop policy if exists "read ratings" on ratings;

create policy "read accessible plans" on plans for select to authenticated using (
  created_by_user_id = (select auth.uid()) or exists (
    select 1 from plan_access a where a.plan_id = plans.id and a.user_id = (select auth.uid())
  )
);
create policy "read accessible plan spots" on plan_spots for select to authenticated using (
  exists (select 1 from plan_access a where a.plan_id = plan_spots.plan_id and a.user_id = (select auth.uid()))
);
create policy "read accessible votes" on votes for select to authenticated using (
  exists (select 1 from plan_access a where a.plan_id = votes.plan_id and a.user_id = (select auth.uid()))
);
create policy "read accessible rsvps" on rsvps for select to authenticated using (
  exists (select 1 from plan_access a where a.plan_id = rsvps.plan_id and a.user_id = (select auth.uid()))
);
create policy "read accessible ratings" on ratings for select to authenticated using (
  exists (select 1 from plan_access a where a.plan_id = ratings.plan_id and a.user_id = (select auth.uid()))
);

drop policy if exists "read spots" on spots;
create policy "read permitted spots" on spots for select to authenticated using (
  source = 'curated'
  or visibility = 'community'
  or created_by_user_id = (select auth.uid())
  or exists (
    select 1 from plan_spots ps
    join plan_access a on a.plan_id = ps.plan_id
    where ps.spot_id = spots.id and a.user_id = (select auth.uid())
  )
);

-- Every participant write must follow a claimed plan membership. This trigger
-- also covers direct future functions, so a forgotten RPC check cannot reopen
-- the boundary.
create or replace function enforce_plan_membership()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not exists (
    select 1 from plan_access a where a.plan_id = new.plan_id and a.user_id = auth.uid()
  ) then
    raise exception 'Plan access required' using errcode = '42501';
  end if;
  return new;
end; $$;

drop trigger if exists votes_require_plan_access on votes;
create trigger votes_require_plan_access before insert or update on votes
for each row execute function enforce_plan_membership();
drop trigger if exists rsvps_require_plan_access on rsvps;
create trigger rsvps_require_plan_access before insert or update on rsvps
for each row execute function enforce_plan_membership();
drop trigger if exists ratings_require_plan_access on ratings;
create trigger ratings_require_plan_access before insert or update on ratings
for each row execute function enforce_plan_membership();

revoke execute on function cast_plan_vote(uuid, uuid, text, boolean, text, smallint, text) from anon;
revoke execute on function set_plan_rsvp(uuid, text, boolean, text, text) from anon;
revoke execute on function rate_plan(uuid, uuid, text, integer, boolean, text) from anon;
grant execute on function cast_plan_vote(uuid, uuid, text, boolean, text, smallint, text) to authenticated;
grant execute on function set_plan_rsvp(uuid, text, boolean, text, text) to authenticated;
grant execute on function rate_plan(uuid, uuid, text, integer, boolean, text) to authenticated;

-- ── Transactional, server-authoritative plan creation ─────────────

create or replace function clean_app_text(value text, maximum integer)
returns text language sql immutable set search_path = pg_catalog as $$
  select left(trim(regexp_replace(translate(coalesce(value, ''),
    chr(8206)||chr(8207)||chr(8234)||chr(8235)||chr(8236)||chr(8237)||chr(8238)||chr(8294)||chr(8295)||chr(8296)||chr(8297),
    ''), '[[:cntrl:]]', '', 'g')), maximum)
$$;

create or replace function sanitize_participant_text()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.voter_name := clean_app_text(new.voter_name, 40);
  if new.voter_name = '' then raise exception 'A participant name is required' using errcode='22023'; end if;
  return new;
end; $$;
drop trigger if exists votes_sanitize_text on votes;
create trigger votes_sanitize_text before insert or update on votes
for each row execute function sanitize_participant_text();
drop trigger if exists rsvps_sanitize_text on rsvps;
create trigger rsvps_sanitize_text before insert or update on rsvps
for each row execute function sanitize_participant_text();
drop trigger if exists ratings_sanitize_text on ratings;
create trigger ratings_sanitize_text before insert or update on ratings
for each row execute function sanitize_participant_text();

create or replace function create_secure_plan(p_plan jsonb, p_spot_ids uuid[])
returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  uid uuid := auth.uid();
  title_value text := clean_app_text(p_plan->>'title', 60);
  category_value text := clean_app_text(p_plan->>'category', 40);
  deadline_value timestamptz;
  age_value integer;
  required_age integer;
  plan_id_value uuid;
  host_token_value text;
  budget_value integer;
  radius_value integer;
  latitude_value double precision;
  longitude_value double precision;
  vibe_values text[] := '{}';
  avoid_values text[] := '{}';
begin
  if uid is null or coalesce(auth.jwt()->>'is_anonymous', 'false') = 'true' then
    raise exception 'A permanent account is required' using errcode = '42501';
  end if;
  if p_plan is null or jsonb_typeof(p_plan) <> 'object'
     or (p_plan - array['title','category','area','deadline','budgetPerPerson','originLabel','originLatitude','originLongitude','radiusKm','smartBrief','vibePreferences','avoidPreferences']) <> '{}'::jsonb then
    raise exception 'Unsupported plan fields' using errcode = '22023';
  end if;
  if title_value = '' or category_value = '' then
    raise exception 'A title and category are required' using errcode = '22023';
  end if;
  if cardinality(p_spot_ids) <> 9 or (select count(distinct item) from unnest(p_spot_ids) item) <> 9 then
    raise exception 'Nine unique places are required' using errcode = '22023';
  end if;

  select extract(year from age(current_date, date_of_birth))::integer into age_value
  from member_ages where user_id = uid;
  if age_value is null then raise exception 'Complete age details first' using errcode = '42501'; end if;
  required_age := case when category_value in ('nightlife','vibes','beach_club') then 21
    when category_value = 'shisha' then 18 else 0 end;
  if age_value < required_age then raise exception 'Category is not age appropriate' using errcode = '42501'; end if;

  if (select count(*) from spots s where s.id = any(p_spot_ids)
      and (s.source = 'curated' or s.created_by_user_id = uid)
      and s.category = category_value
      and age_value >= greatest(s.minimum_age, case when s.category in ('nightlife','vibes','beach_club') then 21 when s.category='shisha' then 18 else 0 end)) <> 9 then
    raise exception 'One or more places are unavailable' using errcode = '42501';
  end if;

  begin deadline_value := (p_plan->>'deadline')::timestamptz;
  exception when others then raise exception 'Invalid deadline' using errcode = '22023'; end;
  if deadline_value is null or deadline_value <= now() or deadline_value > now() + interval '1 year' then
    raise exception 'Deadline must be in the future' using errcode = '22023';
  end if;

  if jsonb_typeof(p_plan->'budgetPerPerson') = 'number' then budget_value := (p_plan->>'budgetPerPerson')::integer; end if;
  if budget_value is not null and budget_value not between 0 and 10000 then raise exception 'Invalid budget' using errcode = '22023'; end if;
  if jsonb_typeof(p_plan->'radiusKm') = 'number' then radius_value := (p_plan->>'radiusKm')::integer; end if;
  if radius_value is not null and radius_value not between 1 and 500 then raise exception 'Invalid radius' using errcode = '22023'; end if;
  if jsonb_typeof(p_plan->'originLatitude') = 'number' then latitude_value := (p_plan->>'originLatitude')::double precision; end if;
  if jsonb_typeof(p_plan->'originLongitude') = 'number' then longitude_value := (p_plan->>'originLongitude')::double precision; end if;
  if latitude_value is not null and latitude_value not between -90 and 90 then raise exception 'Invalid latitude' using errcode = '22023'; end if;
  if longitude_value is not null and longitude_value not between -180 and 180 then raise exception 'Invalid longitude' using errcode = '22023'; end if;
  if (latitude_value is null) <> (longitude_value is null) then raise exception 'Coordinates must be provided together' using errcode = '22023'; end if;

  if jsonb_typeof(p_plan->'vibePreferences') = 'array' then
    select coalesce(array_agg(clean_app_text(value, 30) order by ord), '{}') into vibe_values
    from jsonb_array_elements_text(p_plan->'vibePreferences') with ordinality item(value, ord) where ord <= 6;
  end if;
  if jsonb_typeof(p_plan->'avoidPreferences') = 'array' then
    select coalesce(array_agg(clean_app_text(value, 30) order by ord), '{}') into avoid_values
    from jsonb_array_elements_text(p_plan->'avoidPreferences') with ordinality item(value, ord) where ord <= 5;
  end if;

  insert into plans(title, category, area, deadline, status, stage, pool_count,
    budget_per_person, origin_label, origin_latitude, origin_longitude, radius_km,
    smart_brief, vibe_preferences, avoid_preferences, intelligence_model, created_by_user_id)
  values(title_value, category_value, nullif(clean_app_text(p_plan->>'area',80),''), deadline_value,
    'open','pool',3,budget_value,nullif(clean_app_text(p_plan->>'originLabel',80),''),
    latitude_value,longitude_value,radius_value,nullif(clean_app_text(p_plan->>'smartBrief',600),''),
    vibe_values,avoid_values,null,uid)
  returning id into plan_id_value;

  host_token_value := encode(gen_random_bytes(32), 'hex');
  insert into plan_host_tokens(plan_id, token_hash)
  values(plan_id_value, encode(digest(host_token_value, 'sha256'), 'hex'));
  insert into plan_spots(plan_id, spot_id, pool_number, advanced)
  select plan_id_value, spot_id, ((ord - 1) % 3 + 1)::smallint, false
  from unnest(p_spot_ids) with ordinality selected(spot_id, ord);
  insert into plan_access(plan_id, user_id) values(plan_id_value, uid);

  return jsonb_build_object('id', plan_id_value, 'hostToken', host_token_value);
end; $$;
-- 021: signed-in, non-anonymous sessions only (the body re-checks). The app
-- calls this with the publishable key plus a user session, so `authenticated`
-- is the role it actually needs -- do not narrow this further.
revoke all on function create_secure_plan(jsonb, uuid[]) from public, anon;
grant execute on function create_secure_plan(jsonb, uuid[]) to authenticated;

drop policy if exists "create own plans" on plans;
drop policy if exists "update own plans" on plans;
drop policy if exists "attach own plan_spots" on plan_spots;
drop policy if exists "attach host token" on plan_host_tokens;
revoke insert, update, delete on plans, plan_spots, plan_host_tokens from anon, authenticated;
revoke insert, update, delete on votes, rsvps, ratings from anon, authenticated;

-- ── Permanent-account and social privacy boundaries ───────────────

create or replace function is_permanent_user()
returns boolean language sql stable set search_path = pg_catalog as $$
  select auth.uid() is not null and coalesce(auth.jwt()->>'is_anonymous','false') <> 'true'
$$;

drop policy if exists "read own age" on member_ages;
create or replace function current_member_age()
returns integer language sql stable security definer set search_path = public, pg_temp as $$
  select extract(year from age(current_date, date_of_birth))::integer
  from member_ages where user_id = auth.uid() and is_permanent_user()
$$;
revoke all on function current_member_age() from public;
grant execute on function current_member_age() to authenticated;

-- Anonymous guests cannot turn a throwaway identity into a durable profile.
create or replace function ensure_authenticated_profile(
  p_display_name text, p_emoji text default '?', p_color text default '#34363b'
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); profile_id uuid;
begin
  if uid is null or not is_permanent_user() then raise exception 'Permanent account required' using errcode='42501'; end if;
  select id into profile_id from people where auth_user_id = uid;
  if profile_id is not null then return profile_id; end if;
  insert into people(id, display_name, emoji, color, auth_user_id)
  values(uid, coalesce(nullif(clean_app_text(p_display_name,40),''),'Friend'), '?', '#34363b', uid)
  on conflict(auth_user_id) do update set auth_user_id=excluded.auth_user_id returning id into profile_id;
  return profile_id;
end; $$;
revoke all on function ensure_authenticated_profile(text,text,text) from public;
grant execute on function ensure_authenticated_profile(text,text,text) to authenticated;

drop policy if exists "read people" on people;
drop policy if exists "read friendships" on friendships;
drop policy if exists "read visits" on visits;
drop policy if exists "read companions" on visit_companions;
create policy "read permitted people" on people for select to authenticated using (
  is_permanent_user() and (auth_user_id = (select auth.uid()) or exists (
    select 1 from friendships f where f.person_id = (select auth.uid()) and f.friend_id = people.id
  ))
);
create policy "read own friendships" on friendships for select to authenticated using (
  is_permanent_user() and person_id = (select auth.uid())
);
create policy "read permitted visits" on visits for select to authenticated using (
  is_permanent_user() and (person_id = (select auth.uid()) or exists (
    select 1 from friendships f where f.person_id = (select auth.uid()) and f.friend_id = visits.person_id
  ))
);
create policy "read permitted companions" on visit_companions for select to authenticated using (
  is_permanent_user() and exists (select 1 from visits v where v.id = visit_companions.visit_id)
);

drop policy if exists "create own profile" on people;
drop policy if exists "update own profile" on people;
create policy "create own permanent profile" on people for insert to authenticated
  with check (is_permanent_user() and id = (select auth.uid()) and auth_user_id = (select auth.uid()));
create policy "update own permanent profile" on people for update to authenticated
  using (is_permanent_user() and auth_user_id = (select auth.uid()))
  with check (is_permanent_user() and auth_user_id = (select auth.uid()));

drop policy if exists "create custom spots" on spots;
drop policy if exists "update own custom spots" on spots;
drop policy if exists "delete own custom spots" on spots;
create policy "create own custom spots" on spots for insert to authenticated
  with check (is_permanent_user() and source='custom' and created_by_user_id=(select auth.uid()));
create policy "update own custom spots" on spots for update to authenticated
  using (is_permanent_user() and source='custom' and created_by_user_id=(select auth.uid()))
  with check (is_permanent_user() and source='custom' and created_by_user_id=(select auth.uid()));
create policy "delete own custom spots" on spots for delete to authenticated
  using (is_permanent_user() and source='custom' and created_by_user_id=(select auth.uid()));

-- Enforce image restrictions at Storage even before the production uploader
-- is connected.
update storage.buckets set file_size_limit = 8388608,
  allowed_mime_types = array['image/jpeg','image/png','image/webp']
where id = 'visit-photos';

-- ── Durable quotas and minimized security events ──────────────────

create table if not exists app_control_secrets (
  name text primary key,
  secret_hash text not null,
  created_at timestamptz not null default now()
);
alter table app_control_secrets enable row level security;

create table if not exists app_rate_limits (
  scope text not null,
  subject text not null,
  window_start timestamptz not null,
  request_count integer not null default 0 check(request_count >= 0),
  primary key(scope, subject, window_start)
);
alter table app_rate_limits enable row level security;

create table if not exists security_events (
  id bigint generated always as identity primary key,
  event_type text not null,
  outcome text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  subject_hash text,
  request_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists security_events_created_idx on security_events(created_at desc);
alter table security_events enable row level security;

create or replace function valid_control_secret(p_secret text)
returns boolean language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select exists(select 1 from app_control_secrets
    where name='server-control' and secret_hash = crypt(p_secret, secret_hash))
$$;
-- 021: `from public` alone is a no-op against Supabase's named grants to
-- anon/authenticated. This function returns a boolean instead of raising, so
-- an anon grant is an unauthenticated oracle for the server-control secret.
-- Only the owner (and the SECURITY DEFINER functions below, which run as the
-- owner) may execute it. No client role can.
revoke all on function valid_control_secret(text) from public, anon, authenticated;

create or replace function consume_app_quota(p_secret text, p_scope text)
returns boolean language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare uid uuid := auth.uid(); minute_start timestamptz := date_trunc('minute',now()); day_start timestamptz := date_trunc('day',now()); current_count integer; minute_limit integer; day_limit integer;
begin
  if not valid_control_secret(p_secret) or uid is null
     or p_scope not in ('smart-search','plan-create','place-import','spot-deal') then
    raise exception 'Server authorization required' using errcode='42501';
  end if;
  -- 022: 'spot-deal' gets its own bucket. Dealing happens before a plan
  -- exists and is re-rolled repeatedly, so sharing plan-create's bucket
  -- would lock a user out of creating the plan they were dealing for.
  minute_limit := case p_scope
    when 'smart-search' then 10 when 'plan-create' then 12 when 'spot-deal' then 30 else 20 end;
  day_limit := case p_scope
    when 'smart-search' then 30 when 'plan-create' then 50 when 'spot-deal' then 300 else 200 end;
  insert into app_rate_limits values(p_scope||'-minute',uid::text,minute_start,1)
    on conflict(scope,subject,window_start) do update set request_count=app_rate_limits.request_count+1
    returning request_count into current_count;
  if current_count > minute_limit then return false; end if;
  insert into app_rate_limits values(p_scope||'-day',uid::text,day_start,1)
    on conflict(scope,subject,window_start) do update set request_count=app_rate_limits.request_count+1
    returning request_count into current_count;
  if current_count > day_limit then return false; end if;
  if p_scope = 'smart-search' then
    insert into app_rate_limits values('smart-search-global','global',day_start,1)
      on conflict(scope,subject,window_start) do update set request_count=app_rate_limits.request_count+1
      returning request_count into current_count;
    return current_count <= 300;
  end if;
  return true;
end; $$;
-- 021: signed-in sessions only. Quota is keyed on uid::text and the body
-- raises when auth.uid() is null, so anon could never spend quota anyway.
revoke all on function consume_app_quota(text,text) from public, anon, authenticated;
grant execute on function consume_app_quota(text,text) to authenticated;

create or replace function record_security_event(p_secret text, p_event_type text, p_outcome text,
  p_subject_hash text default null, p_request_id text default null, p_metadata jsonb default '{}')
returns void language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if not valid_control_secret(p_secret) then raise exception 'Server authorization required' using errcode='42501'; end if;
  if p_event_type not in ('otp_request','otp_verify','captcha','authorization','rate_limit','plan_command','ai_quota')
     or p_outcome not in ('success','failure','blocked') then raise exception 'Unsupported event' using errcode='22023'; end if;
  if pg_column_size(coalesce(p_metadata,'{}')) > 2048 then raise exception 'Metadata too large' using errcode='22023'; end if;
  insert into security_events(event_type,outcome,actor_user_id,subject_hash,request_id,metadata)
  values(p_event_type,p_outcome,auth.uid(),left(p_subject_hash,128),left(p_request_id,128),coalesce(p_metadata,'{}'));
end; $$;
-- 021: `anon` is DELIBERATE here. The OTP request/verify server actions log
-- otp_request / otp_verify before any session exists, so their role really is
-- anon. Safe to leave open: returns void and raises 42501 without the control
-- secret, so it tells an uninformed caller nothing.
revoke all on function record_security_event(text,text,text,text,text,jsonb) from public;
grant execute on function record_security_event(text,text,text,text,text,jsonb) to anon, authenticated;

-- 026: OTP request has no session yet (pre-auth), so it can't use
-- consume_app_quota (requires auth.uid()). Same anon-callable,
-- control-secret-gated shape as record_security_event above; subject is a
-- HMAC'd email computed in lib/security/controls.ts, never a raw address.
create or replace function consume_otp_request_limit(p_secret text, p_subject text)
returns boolean language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  minute_start timestamptz := date_trunc('minute', now());
  day_start timestamptz := date_trunc('day', now());
  current_count integer;
  subject_key text := left(p_subject, 128);
begin
  if not valid_control_secret(p_secret) or subject_key is null or subject_key = '' then
    raise exception 'Server authorization required' using errcode = '42501';
  end if;
  insert into app_rate_limits values('otp-request-minute', subject_key, minute_start, 1)
    on conflict(scope,subject,window_start) do update set request_count = app_rate_limits.request_count+1
    returning request_count into current_count;
  if current_count > 3 then return false; end if;
  insert into app_rate_limits values('otp-request-day', subject_key, day_start, 1)
    on conflict(scope,subject,window_start) do update set request_count = app_rate_limits.request_count+1
    returning request_count into current_count;
  if current_count > 10 then return false; end if;
  return true;
end; $$;
revoke all on function consume_otp_request_limit(text,text) from public, authenticated;
grant execute on function consume_otp_request_limit(text,text) to anon, authenticated;

-- Private Presence channel: topic is plan:<uuid>:presence.
drop policy if exists "plan members receive presence" on realtime.messages;
drop policy if exists "plan members send presence" on realtime.messages;
create policy "plan members receive presence" on realtime.messages for select to authenticated using (
  realtime.messages.extension = 'presence'
  and (select realtime.topic()) ~ '^plan:[0-9a-f-]{36}:presence$'
  and exists(select 1 from plan_access a where a.user_id=(select auth.uid())
    and a.plan_id=split_part((select realtime.topic()),':',2)::uuid)
);
create policy "plan members send presence" on realtime.messages for insert to authenticated with check (
  realtime.messages.extension = 'presence'
  and (select realtime.topic()) ~ '^plan:[0-9a-f-]{36}:presence$'
  and exists(select 1 from plan_access a where a.user_id=(select auth.uid())
    and a.plan_id=split_part((select realtime.topic()),':',2)::uuid)
);

-- Keep only recent operational data. Run daily through Supabase Cron.
create or replace function purge_security_operational_data()
returns void language sql security definer set search_path = public, pg_temp as $$
  delete from security_events where created_at < now() - interval '90 days';
  delete from app_rate_limits where window_start < now() - interval '2 days';
$$;
revoke all on function purge_security_operational_data() from public, anon, authenticated;

-- 024 (SEC.4): the `revoke ... from public` lines above these functions miss
-- Supabase's named `anon` grant (same root cause as 021). Restate the intent.
-- Client-facing RPCs keep `authenticated`:
revoke all on function set_birth_date(date) from public, anon;
grant execute on function set_birth_date(date) to authenticated;
revoke all on function current_member_age() from public, anon;
grant execute on function current_member_age() to authenticated;
revoke all on function ensure_authenticated_profile(text, text, text) from public, anon;
grant execute on function ensure_authenticated_profile(text, text, text) to authenticated;
-- Internal helpers and trigger functions — no client role executes these
-- directly; they run as the function owner from a trigger or another definer:
revoke all on function ensure_default_place_collections(uuid) from public, anon, authenticated;
revoke all on function mirror_friendship() from public, anon, authenticated;
revoke all on function people_default_place_collections() from public, anon, authenticated;
-- (rls_auto_enable is live-only drift — not defined here; 024 handles it if present.)

-- 028: "add own friendships" / "remove own friendships" (originally created
-- above, never touched by 020's people/friendships rewrite) queried `people`
-- to check ownership, and `people`'s own read policy queries `friendships` —
-- that mutual cross-reference is a real 42P17 (infinite recursion detected in
-- policy) on every write to friendships. `friendships.person_id` is always
-- exactly auth.uid() for a permanent account (people.id = auth_user_id =
-- auth.uid() by construction), so the people lookup was redundant; dropping
-- it breaks the cycle with no loss of permissiveness (the FK to people still
-- requires a real row to exist).
drop policy if exists "add own friendships" on friendships;
create policy "add own friendships" on friendships for insert to authenticated
  with check (is_permanent_user() and person_id = (select auth.uid()));
drop policy if exists "remove own friendships" on friendships;
create policy "remove own friendships" on friendships for delete to authenticated
  using (is_permanent_user() and person_id = (select auth.uid()));
