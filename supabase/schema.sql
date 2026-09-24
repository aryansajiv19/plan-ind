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
drop table if exists moodboard_items cascade;
drop table if exists moodboards cascade;
drop table if exists visit_photos cascade;
drop table if exists visit_collection_items cascade;
drop table if exists visit_collections cascade;
drop table if exists visit_companions cascade;
drop table if exists visits cascade;
drop table if exists friend_invites cascade;
drop table if exists friendships cascade;
drop table if exists people cascade;

drop table if exists ratings cascade;
drop table if exists rsvps cascade;
drop table if exists votes cascade;
drop table if exists plan_spots cascade;
drop table if exists plans cascade;
drop table if exists spots cascade;

-- Curated hangout places of any category. Pre-loaded so nobody researches.
-- ⚠ Column-level SELECT grants (051). RULE: a uid column on a client-readable
-- table is withheld from client SELECT by default and granted only deliberately.
-- Adding a column here requires a matching grant in a new migration, or clients
-- SILENTLY won't see it.
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
  -- 038: where the photo came from, because the claims are not
  -- interchangeable. A venue's own image IS that venue; a Wikimedia landmark
  -- shot usually is; a stock category image is NOT -- it only looks like one.
  -- photo_attribution is a licence obligation, not metadata: whatever renders
  -- photo_url MUST render this beside it when non-null. See migration-038.
  photo_source text check (photo_source is null or photo_source in ('venue_site', 'wikimedia', 'stock')),
  photo_attribution text check (photo_attribution is null or char_length(photo_attribution) <= 300),
  description text,                     -- a review blurb to help people decide
  booking_url text,
  source      text not null default 'curated' check (source in ('curated', 'custom')),
  visibility  text not null default 'community' check (visibility in ('private', 'friends', 'community')),
  created_by_user_id uuid references auth.users(id) on delete set null, -- 060
  address     text,
  latitude    double precision,
  longitude   double precision
  -- 060: a custom spot needs an owner on INSERT (trigger below), not
  -- forever: created_by_user_id goes null when the owner deletes their account
  -- and someone else's plan or visit still points at the spot.
  -- 038: a source that requires crediting must carry its credit, enforced
  -- here so an un-credited CC image cannot be inserted at all rather than
  -- relying on the backfill script to remember. Venue sites are exempt: it
  -- is their own image, used to represent them.
  ,constraint spots_photo_attribution_required check (
    photo_source is null or photo_source = 'venue_site' or photo_attribution is not null)
  ,constraint spots_photo_source_needs_photo check (
    photo_source is null or photo_url is not null)
  ,constraint spots_mainstream_content_check check (lower(concat_ws(' ', name, cuisine, vibe, description)) !~ '(strip[[:space:]-]*club|gentlemen''s[[:space:]]+club|adult[[:space:]-]+entertainment|erotic[[:space:]]+massage|escort[[:space:]]+service|brothel|sex[[:space:]]+club|swinger[[:space:]]+club|topless[[:space:]]+bar|nude[[:space:]]+show)')
);

create index spots_owner_idx on spots (created_by_user_id) where source = 'custom';
-- 027: app/home/page.tsx's `order by name limit 120` is the one unbounded-
-- growth hot query on this table (no source/category filter, just RLS) —
-- benchmarked ~49x faster with this index at 20k rows. See migration-027.
create index spots_name_idx on spots (name);

-- 040. Search is `name ilike '%q%'`, which no btree can serve. The btree
-- above is still used for a COMMON term (walk in name order, stop at
-- LIMIT 8); the pathological case is a rare or absent term, where it must
-- walk everything. Measured at 5082 rows: a miss went 2.256 ms -> 0.074 ms.
-- The planner ignores this index below ~1,200 rows -- a seq scan of 1082 is
-- genuinely cheaper -- so it is dormant at today's catalogue size and starts
-- paying just past 1000. See migration-040.
create extension if not exists pg_trgm with schema extensions;
create index spots_name_trgm_idx on spots using gin (name extensions.gin_trgm_ops);

-- 040. dealSpotIds filters source='curated' plus a category family; partial
-- on source since every deal query carries it. 0.656 ms -> 0.340 ms at 5082.
-- Deliberately NOT indexing `area`: it is never a SQL filter in this
-- codebase, only read in JS for coordinate lookup.
create index spots_curated_category_idx on spots (category) where source = 'curated';

-- A plan == one share link. The uuid IS the slug in the URL.
-- ⚠ Column-level SELECT grants (051). RULE: a uid column on a client-readable
-- table is withheld from client SELECT by default and granted only deliberately.
-- Adding a column here requires a matching grant in a new migration, or clients
-- SILENTLY won't see it.
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
  created_at     timestamptz not null default now(),
  reopened_at    timestamptz            -- 057: set by reopen_plan
);

-- 014: schema.sql previously mirrored only plans' columns, not this index --
-- a project rebuilt from this file alone would silently lack it.
create index plans_creator_idx on plans (created_by_user_id);

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

-- One row per voter choice in a pool or final. One vote per ACCOUNT per round
-- is enforced by the partial unique index votes_user_round_key (061, at the
-- end of this file) — keyed on auth user_id, not the caller-chosen token hash
-- or the typed name.
-- ⚠ Column-level SELECT grants (049): adding a column here requires a matching
-- grant in a new migration, or clients SILENTLY won't see it.
create table votes (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references plans(id) on delete cascade,
  spot_id    uuid not null references spots(id) on delete cascade,
  voter_name text not null,
  value      boolean not null,
  phase      text not null default 'final' check (phase in ('pool', 'final')),
  pool_number smallint not null default 0 check (pool_number between 0 and 6),
  participant_token_hash text,
  -- 043: who actually cast this. The hash beside it is an identity
  -- marker, NOT a credential -- see the 043 section below.
  user_id    uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index votes_plan_idx on votes (plan_id);
create index votes_round_idx on votes (plan_id, phase, pool_number);

-- One row per (voter, plan). coming = true means "I'm actually coming".
-- Headcount (not vote count) is what the booking uses.
-- ⚠ Column-level SELECT grants (049): adding a column here requires a matching
-- grant in a new migration, or clients SILENTLY won't see it.
create table rsvps (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references plans(id) on delete cascade,
  voter_name text not null,
  coming     boolean not null default true,
  choice     text not null default 'coming' check (choice in ('coming', 'maybe', 'no')),
  participant_token_hash text,
  -- 035: carpool coordination -- a list, not a matcher (design-system/
  -- SPECS.md §10.2). seats_available only means something when driving.
  transport  text check (transport in ('driving', 'need_ride', 'own_way')),
  seats_available smallint check (seats_available is null or seats_available between 0 and 8),
  created_at timestamptz not null default now(),
  unique (plan_id, voter_name),
  -- 043: who actually replied. See the 043 section below.
  user_id    uuid references auth.users(id) on delete set null,
  constraint rsvps_seats_only_when_driving check (seats_available is null or transport = 'driving')
);

create index rsvps_plan_idx on rsvps (plan_id);

-- One rating per (plan, voter) after the visit: stars + "would go again?".
-- ⚠ Column-level SELECT grants (049): adding a column here requires a matching
-- grant in a new migration, or clients SILENTLY won't see it.
create table ratings (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references plans(id) on delete cascade,
  spot_id    uuid not null references spots(id) on delete cascade,
  voter_name text not null,
  stars      int  not null check (stars between 1 and 5),
  again      boolean not null,
  participant_token_hash text,
  -- 043: who actually rated. See the 043 section below.
  user_id    uuid references auth.users(id) on delete set null,
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
-- swapping personal invite links: one person creates the link, the other
-- redeems it (048's redeem_friend_invite, the only write path). The link is
-- the handshake; both edges are written at once.
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

-- 036: Discover moodboards (design-system/SPECS.md §15.3). Same free-form,
-- user-named-collection shape as visit_collections above, not
-- place_collections' fixed-default-pair model. storage_path (not an inline
-- base64 image) matches visit_photos' real-image-bytes pattern -- see
-- migration 036's header for why that's a deliberate deviation from
-- lib/planning.ts's demo-only imageDataUrl shape.
create table moodboards (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references people(id) on delete cascade,
  name       text not null check (char_length(trim(name)) between 1 and 40),
  theme      text check (theme is null or char_length(theme) <= 40),
  visibility text not null default 'private' check (visibility in ('private', 'friends', 'shared')),
  created_at timestamptz not null default now()
);
create unique index moodboards_name_ci_idx
  on moodboards (person_id, lower(trim(name)));

create table moodboard_items (
  id           uuid primary key default gen_random_uuid(),
  moodboard_id uuid not null references moodboards(id) on delete cascade,
  kind         text not null check (kind in ('place', 'link', 'photo')),
  label        text not null check (char_length(trim(label)) between 1 and 80),
  note         text check (note is null or char_length(note) <= 280),
  storage_path text,
  source_url   text check (source_url is null or char_length(source_url) <= 2048),
  created_at   timestamptz not null default now()
);
create index moodboard_items_moodboard_idx on moodboard_items (moodboard_id);

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
alter table moodboards enable row level security;
alter table moodboard_items enable row level security;
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
-- ⚠ 052 ADDED an owner-only UPDATE on visits, column-scoped to visited_at,
-- group_label and note (security-reviewed). logVisit must STILL not use
-- `.upsert`: person_id/spot_id/plan_id are not updatable, so an upsert fails.
-- History below: why UPDATE was withheld before that.
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

-- 036: moodboards. Owner-scoped, matches "manage own visit collections"
-- exactly.
create policy "manage own moodboards" on moodboards for all to authenticated
  using (exists (select 1 from people p where p.id = person_id and p.auth_user_id = (select auth.uid())))
  with check (exists (select 1 from people p where p.id = person_id and p.auth_user_id = (select auth.uid())));

create policy "manage own moodboard items" on moodboard_items for all to authenticated
  using (exists (
    select 1 from moodboards b join people p on p.id = b.person_id
    where b.id = moodboard_id and p.auth_user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from moodboards b join people p on p.id = b.person_id
    where b.id = moodboard_id and p.auth_user_id = (select auth.uid())
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

-- 038: catalogue photos. PUBLIC, unlike visit-photos, and deliberately so:
-- there is no owning user to sign a URL, and every visitor loads these on
-- every card, so an expiring signed URL is the wrong shape entirely.
insert into storage.buckets (id, name, public)
values ('spot-photos', 'spot-photos', true)
on conflict (id) do update set public = true;

create policy "read spot photo files" on storage.objects for select to anon, authenticated
  using (bucket_id = 'spot-photos');
-- Public-read is not public-write, and nothing in this project can write here
-- through the API: there is deliberately NO service-role key (see the
-- invariants in CLAUDE.md), so the six catalogue images are uploaded by the
-- owner through the Supabase dashboard. Stated precisely because an earlier
-- draft of this comment said "the backfill writes via the service role",
-- which was wrong and is the kind of prose that authorises someone to mint
-- one later.
--
-- ⚠ `as restrictive` is load-bearing. As ordinary permissive policies these
-- would be OR'd with the visit-photos grants above and would GRANT insert
-- into every other bucket unconditionally, defeating visit-photos' own
-- folder-ownership check. Restrictive policies are AND'd, so they subtract
-- permission without granting any. A permissive policy cannot express
-- "deny". (Caught by verify-journey.mjs step 25 on 038's first draft.)
create policy "no client writes to spot photos" on storage.objects
  as restrictive for insert to anon, authenticated
  with check (bucket_id <> 'spot-photos');
create policy "no client updates to spot photos" on storage.objects
  as restrictive for update to anon, authenticated
  using (bucket_id <> 'spot-photos');
create policy "no client deletes of spot photos" on storage.objects
  as restrictive for delete to anon, authenticated
  using (bucket_id <> 'spot-photos');

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
-- supabase/migration-019-secret-isolation-and-rpc-integrity.sql, plus 050's
-- return that drops created_by_user_id.
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
  return jsonb_build_object('plan', to_jsonb(target) - 'created_by_user_id', 'winner_spot_id', target.winner_spot_id, 'finalists', finalists);
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
  p_plan_id uuid, p_voter_name text, p_coming boolean, p_choice text, p_participant_token_hash text,
  p_transport text default null, p_seats_available smallint default null
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing rsvps%rowtype;
  target plans%rowtype;
  clean_name text := left(trim(p_voter_name), 40);
begin
  -- 040: the `p_choice is null` test is load-bearing. Without it,
  -- `NULL not in (...)` is NULL rather than TRUE, the `or` never fires, and a
  -- null choice reaches the insert to die on NOT NULL as a raw 23502.
  if p_participant_token_hash !~ '^[0-9a-f]{64}$'
     or p_choice is null or p_choice not in ('coming', 'maybe', 'no') then
    raise exception 'Participant authorization required' using errcode = '42501';
  end if;
  if clean_name = '' then
    raise exception 'Enter a name before replying' using errcode = '22023';
  end if;
  -- 035: carpool coordination fields, validated the same way every other
  -- optional field in this function's family is -- explicit allow-list /
  -- range check, not left to the column constraint alone.
  if p_transport is not null and p_transport not in ('driving', 'need_ride', 'own_way') then
    raise exception 'Unsupported transport choice' using errcode = '22023';
  end if;
  if p_seats_available is not null and (p_transport is distinct from 'driving' or p_seats_available not between 0 and 8) then
    raise exception 'Seats only apply when driving, 0 to 8' using errcode = '22023';
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
        insert into rsvps (plan_id, voter_name, coming, choice, participant_token_hash, transport, seats_available)
        values (p_plan_id, clean_name, p_coming, p_choice, p_participant_token_hash, p_transport, p_seats_available);
        return;
      exception when unique_violation then
      end;
    else
      update rsvps set coming = p_coming, choice = p_choice, participant_token_hash = p_participant_token_hash,
        transport = p_transport, seats_available = p_seats_available
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
revoke all on function set_plan_rsvp(uuid, text, boolean, text, text, text, smallint) from public;
revoke all on function rate_plan(uuid, uuid, text, integer, boolean, text) from public;
-- These three are granted to `authenticated` ONLY. They previously read
-- `to anon, authenticated` here and were revoked from anon 180-odd lines
-- below (migration 020's section), which meant the file that is supposed to
-- MIRROR live spent most of its length claiming anon could execute the write
-- RPCs. Live was always correct; the file was not, and a reader checking
-- "can anon write?" by grepping would have got the wrong answer.
grant execute on function cast_plan_vote(uuid, uuid, text, boolean, text, smallint, text) to authenticated;
grant execute on function set_plan_rsvp(uuid, text, boolean, text, text, text, smallint) to authenticated;
grant execute on function rate_plan(uuid, uuid, text, integer, boolean, text) to authenticated;

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

-- 041: a signed-out visitor may read the CURATED catalogue, and nothing else.
-- Without this, every policy on `spots` was `to authenticated`, so the front
-- door's venue wall returned zero rows and no error to every prospect --
-- silently, which is why it read as "no spots passed" rather than "no read
-- permission". Scoped to source='curated' on purpose: those rows are
-- editorial venue data with no owner and no personal fields. `custom` spots
-- stay governed solely by the authenticated policy above.
create policy "read curated spots anonymously" on spots
  for select to anon using (source = 'curated');

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
revoke execute on function set_plan_rsvp(uuid, text, boolean, text, text, text, smallint) from anon;
revoke execute on function rate_plan(uuid, uuid, text, integer, boolean, text) from anon;
grant execute on function cast_plan_vote(uuid, uuid, text, boolean, text, smallint, text) to authenticated;
grant execute on function set_plan_rsvp(uuid, text, boolean, text, text, text, smallint) to authenticated;
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
set search_path = public, extensions, pg_temp set timezone = 'Asia/Dubai' as $$
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
  if title_value = '' or clean_display_name(title_value) = '' or category_value = '' then
    raise exception 'A title and category are required' using errcode = '22023';
  end if;
  if cardinality(p_spot_ids) <> 9 or (select count(distinct item) from unnest(p_spot_ids) item) <> 9 then
    raise exception 'Nine unique places are required' using errcode = '22023';
  end if;

  select extract(year from age(current_date, date_of_birth))::integer into age_value
  from member_ages where user_id = uid;
  if age_value is null then raise exception 'Complete age details first' using errcode = '42501'; end if;
  required_age := category_min_age(category_value);
  if age_value < required_age then raise exception 'Category is not age appropriate' using errcode = '42501'; end if;

  -- 033: no clause requiring s.category = category_value -- no curated
  -- category has 9 spots on its own (dinner, the largest, has 5), so
  -- /api/spots/deal deals from the whole category family by design
  -- (categoryFamily() in lib/spots/match.ts) and a plan's 9 spots routinely
  -- span several categories. The strict match blocked every plan creation.
  if (select count(*) from spots s where s.id = any(p_spot_ids)
      and (s.source = 'curated' or s.created_by_user_id = uid)
      and age_value >= spot_required_age(s.category, s.minimum_age)) <> 9 then
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

-- 034: a direct-decide plan (one known spot, no vote) -- a parallel
-- function to create_secure_plan, not a branch inside it. See migration
-- 034's header for why the invariants don't share a body cleanly.
create or replace function create_direct_plan(p_plan jsonb, p_spot_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp set timezone = 'Asia/Dubai' as $$
declare
  uid uuid := auth.uid();
  title_value text := clean_app_text(p_plan->>'title', 60);
  category_value text;
  deadline_value timestamptz;
  age_value integer;
  spot_min_age integer;
  spot_category_required_age integer;
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
     or (p_plan - array['title','area','deadline','budgetPerPerson','originLabel','originLatitude','originLongitude','radiusKm','smartBrief','vibePreferences','avoidPreferences']) <> '{}'::jsonb then
    raise exception 'Unsupported plan fields' using errcode = '22023';
  end if;
  if title_value = '' or clean_display_name(title_value) = '' or p_spot_id is null then
    raise exception 'A title and a place are required' using errcode = '22023';
  end if;

  select extract(year from age(current_date, date_of_birth))::integer into age_value
  from member_ages where user_id = uid;
  if age_value is null then raise exception 'Complete age details first' using errcode = '42501'; end if;

  select s.category, s.minimum_age, category_min_age(s.category)
  into category_value, spot_min_age, spot_category_required_age
  from spots s
  where s.id = p_spot_id and (s.source = 'curated' or s.created_by_user_id = uid);
  if category_value is null then
    raise exception 'That place is unavailable' using errcode = '42501';
  end if;
  if age_value < greatest(spot_min_age, spot_category_required_age) then
    raise exception 'That place is not age appropriate' using errcode = '42501';
  end if;

  begin deadline_value := nullif(p_plan->>'deadline', '')::timestamptz;
  exception when others then deadline_value := null; end;

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
    smart_brief, vibe_preferences, avoid_preferences, intelligence_model, created_by_user_id,
    winner_spot_id)
  values(title_value, category_value, nullif(clean_app_text(p_plan->>'area',80),''), deadline_value,
    'decided','decided',1,budget_value,nullif(clean_app_text(p_plan->>'originLabel',80),''),
    latitude_value,longitude_value,radius_value,nullif(clean_app_text(p_plan->>'smartBrief',600),''),
    vibe_values,avoid_values,null,uid,
    p_spot_id)
  returning id into plan_id_value;

  host_token_value := encode(gen_random_bytes(32), 'hex');
  insert into plan_host_tokens(plan_id, token_hash)
  values(plan_id_value, encode(digest(host_token_value, 'sha256'), 'hex'));
  insert into plan_spots(plan_id, spot_id, pool_number, advanced)
  values(plan_id_value, p_spot_id, 1, true);
  insert into plan_access(plan_id, user_id) values(plan_id_value, uid);

  return jsonb_build_object('id', plan_id_value, 'hostToken', host_token_value);
end; $$;
revoke all on function create_direct_plan(jsonb, uuid) from public, anon;
grant execute on function create_direct_plan(jsonb, uuid) to authenticated;

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
     or p_scope not in ('smart-search','plan-create','place-import','spot-deal','plan-command') then
    raise exception 'Server authorization required' using errcode='42501';
  end if;
  -- 022: 'spot-deal' gets its own bucket. Dealing happens before a plan
  -- exists and is re-rolled repeatedly, so sharing plan-create's bucket
  -- would lock a user out of creating the plan they were dealing for.
  -- 030: 'plan-command' gets its own bucket too -- was the only app/api/**
  -- route with zero rate limiting.
  minute_limit := case p_scope
    when 'smart-search' then 10 when 'plan-create' then 12 when 'spot-deal' then 30
    when 'plan-command' then 20 else 20 end;
  day_limit := case p_scope
    when 'smart-search' then 30 when 'plan-create' then 50 when 'spot-deal' then 300
    when 'plan-command' then 100 else 200 end;
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

-- 026: neither OTP step has a session yet (pre-auth), so neither can use
-- consume_app_quota (requires auth.uid()). Same anon-callable,
-- control-secret-gated shape as record_security_event above; subject is a
-- HMAC'd email computed in lib/security/controls.ts, never a raw address.
-- otp-verify exists because GoTrue's own rate limit on token verification is
-- per-IP (360/hr, bursts to 30), not per-code-attempt — trivially bypassed by
-- spreading guesses across a few IPs. Keying this on the target email instead
-- closes that: the cap holds no matter how many IPs a guesser uses.
create or replace function consume_otp_limit(p_secret text, p_scope text, p_subject text)
returns boolean language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  minute_start timestamptz := date_trunc('minute', now());
  day_start timestamptz := date_trunc('day', now());
  current_count integer;
  minute_limit integer;
  day_limit integer;
  subject_key text := left(p_subject, 128);
begin
  if not valid_control_secret(p_secret) or p_scope not in ('otp-request', 'otp-verify')
     or subject_key is null or subject_key = '' then
    raise exception 'Server authorization required' using errcode = '42501';
  end if;
  minute_limit := case p_scope when 'otp-request' then 3 else 8 end;
  day_limit := case p_scope when 'otp-request' then 10 else 20 end;
  insert into app_rate_limits values(p_scope||'-minute', subject_key, minute_start, 1)
    on conflict(scope,subject,window_start) do update set request_count = app_rate_limits.request_count+1
    returning request_count into current_count;
  if current_count > minute_limit then return false; end if;
  insert into app_rate_limits values(p_scope||'-day', subject_key, day_start, 1)
    on conflict(scope,subject,window_start) do update set request_count = app_rate_limits.request_count+1
    returning request_count into current_count;
  if current_count > day_limit then return false; end if;
  return true;
end; $$;
revoke all on function consume_otp_limit(text,text,text) from public, authenticated;
grant execute on function consume_otp_limit(text,text,text) to anon, authenticated;

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

-- Keep only recent operational data. Scheduled daily by migration 031
-- (cron.schedule against pg_cron) -- not repeated here, a fresh scratch
-- project from this file won't have the job registered until that migration
-- also runs against it.
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


-- ── 043: participant identity is bound to auth.uid() ─────────────────────
--
-- `participant_token_hash` was a BEARER TOKEN every co-member could read:
-- the RPCs checked only that it was 64 hex characters, and `read accessible
-- votes` returns the whole row to every member. Anyone a share link was
-- forwarded to could read another member's hash and rewrite or delete their
-- vote -- the app's core promise inverted. auth.uid() is the one value in
-- the exchange the caller cannot choose, so the RPCs now write and check it.
--
-- The unique key deliberately still hangs off the hash rather than user_id;
-- see migration-043's header for why that half is a separate reviewed step.


create index votes_user_idx   on votes (plan_id, user_id);
create index rsvps_user_idx   on rsvps (plan_id, user_id);
create index ratings_user_idx on ratings (plan_id, user_id);

-- ── cast_plan_vote ───────────────────────────────────────────────────────
create or replace function cast_plan_vote(
  p_plan_id uuid, p_spot_id uuid, p_voter_name text, p_value boolean,
  p_phase text, p_pool_number smallint, p_participant_token_hash text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target plans%rowtype;
  clean_name text := left(trim(p_voter_name), 40);
  caller uuid := auth.uid();
begin
  if p_participant_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Participant authorization required' using errcode = '42501';
  end if;
  if caller is null then
    raise exception 'Participant authorization required' using errcode = '42501';
  end if;
  -- 043: the hash is not a credential. Refuse to touch a row that already
  -- belongs to somebody else, whatever hash was presented.
  if exists (
    select 1 from votes v
    where v.plan_id = p_plan_id and v.participant_token_hash = p_participant_token_hash
      and v.user_id is not null and v.user_id <> caller
  ) then
    raise exception 'That participant identity belongs to someone else' using errcode = '42501';
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
  if p_phase <> target.stage then
    raise exception 'This round is no longer open' using errcode = '22023';
  end if;
  if p_phase = 'pool' and (p_pool_number < 1 or p_pool_number > target.pool_count) then
    raise exception 'That round does not exist' using errcode = '22023';
  end if;
  if p_phase = 'final' and p_pool_number <> 0 then
    raise exception 'That round does not exist' using errcode = '22023';
  end if;
  if not exists (
    select 1 from plan_spots ps
    where ps.plan_id = p_plan_id and ps.spot_id = p_spot_id
      and (p_phase = 'final' or ps.pool_number = p_pool_number)
      and (p_phase = 'pool' or ps.advanced)
  ) then
    raise exception 'That place is not on this plan' using errcode = '22023';
  end if;

  if p_value then
    insert into votes (plan_id, spot_id, voter_name, value, phase, pool_number, participant_token_hash, user_id)
    values (p_plan_id, p_spot_id, clean_name, true, p_phase, p_pool_number, p_participant_token_hash, caller)
    on conflict (plan_id, participant_token_hash, phase, pool_number)
      where participant_token_hash is not null
      do update set spot_id = excluded.spot_id, voter_name = excluded.voter_name,
                    value = true, user_id = caller;
  else
    -- Ownership is re-checked here too: the guard above only sees rows that
    -- already carry a user_id, and delete must not become the soft spot.
    delete from votes
      where plan_id = p_plan_id and participant_token_hash = p_participant_token_hash
        and phase = p_phase and pool_number = p_pool_number
        and (user_id is null or user_id = caller);
  end if;

  return jsonb_build_object(
    'plan_id',     p_plan_id,
    'phase',       p_phase,
    'pool_number', p_pool_number,
    'spot_id',     case when p_value then p_spot_id else null end
  );
end; $$;

-- ── set_plan_rsvp ────────────────────────────────────────────────────────
create or replace function set_plan_rsvp(
  p_plan_id uuid, p_voter_name text, p_coming boolean, p_choice text, p_participant_token_hash text,
  p_transport text default null, p_seats_available smallint default null
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing rsvps%rowtype;
  target plans%rowtype;
  clean_name text := left(trim(p_voter_name), 40);
  caller uuid := auth.uid();
begin
  if p_participant_token_hash !~ '^[0-9a-f]{64}$'
     or p_choice is null or p_choice not in ('coming', 'maybe', 'no') then
    raise exception 'Participant authorization required' using errcode = '42501';
  end if;
  if caller is null then
    raise exception 'Participant authorization required' using errcode = '42501';
  end if;
  if exists (
    select 1 from rsvps r
    where r.plan_id = p_plan_id and r.participant_token_hash = p_participant_token_hash
      and r.user_id is not null and r.user_id <> caller
  ) then
    raise exception 'That participant identity belongs to someone else' using errcode = '42501';
  end if;
  if clean_name = '' then
    raise exception 'Enter a name before replying' using errcode = '22023';
  end if;
  if p_transport is not null and p_transport not in ('driving', 'need_ride', 'own_way') then
    raise exception 'Unsupported transport choice' using errcode = '22023';
  end if;
  if p_seats_available is not null and (p_transport is distinct from 'driving' or p_seats_available not between 0 and 8) then
    raise exception 'Seats only apply when driving, 0 to 8' using errcode = '22023';
  end if;

  select * into target from plans where id = p_plan_id;
  if target.id is null then
    raise exception 'That plan does not exist' using errcode = '22023';
  end if;

  loop
    select * into existing from rsvps where plan_id = p_plan_id and voter_name = clean_name for update;
    if existing.id is not null and existing.user_id is not null and existing.user_id <> caller then
      raise exception 'That participant name is already in use' using errcode = '42501';
    end if;
    if existing.id is not null and existing.participant_token_hash is not null
       and existing.participant_token_hash <> p_participant_token_hash then
      raise exception 'That participant name is already in use' using errcode = '42501';
    end if;
    if existing.id is null then
      begin
        insert into rsvps (plan_id, voter_name, coming, choice, participant_token_hash, transport, seats_available, user_id)
        values (p_plan_id, clean_name, p_coming, p_choice, p_participant_token_hash, p_transport, p_seats_available, caller);
        return;
      exception when unique_violation then
      end;
    else
      update rsvps set coming = p_coming, choice = p_choice, participant_token_hash = p_participant_token_hash,
        transport = p_transport, seats_available = p_seats_available, user_id = caller
        where id = existing.id;
      return;
    end if;
  end loop;
end; $$;

-- ── rate_plan ────────────────────────────────────────────────────────────
create or replace function rate_plan(
  p_plan_id uuid, p_spot_id uuid, p_voter_name text, p_stars integer, p_again boolean, p_participant_token_hash text
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing ratings%rowtype;
  target plans%rowtype;
  clean_name text := left(trim(p_voter_name), 40);
  caller uuid := auth.uid();
begin
  if p_participant_token_hash !~ '^[0-9a-f]{64}$' or p_stars not between 1 and 5 then
    raise exception 'Participant authorization required' using errcode = '42501';
  end if;
  if caller is null then
    raise exception 'Participant authorization required' using errcode = '42501';
  end if;
  if exists (
    select 1 from ratings r
    where r.plan_id = p_plan_id and r.participant_token_hash = p_participant_token_hash
      and r.user_id is not null and r.user_id <> caller
  ) then
    raise exception 'That participant identity belongs to someone else' using errcode = '42501';
  end if;
  if clean_name = '' then
    raise exception 'Enter a name before rating' using errcode = '22023';
  end if;

  select * into target from plans where id = p_plan_id;
  if target.id is null or target.status <> 'decided' then
    raise exception 'This plan has not been decided yet' using errcode = '22023';
  end if;
  if target.winner_spot_id is null or target.winner_spot_id <> p_spot_id then
    raise exception 'You can only rate the place the group chose' using errcode = '22023';
  end if;

  loop
    select * into existing from ratings where plan_id = p_plan_id and voter_name = clean_name for update;
    if existing.id is not null and existing.user_id is not null and existing.user_id <> caller then
      raise exception 'That participant name is already in use' using errcode = '42501';
    end if;
    if existing.id is not null and existing.participant_token_hash is not null
       and existing.participant_token_hash <> p_participant_token_hash then
      raise exception 'That participant name is already in use' using errcode = '42501';
    end if;
    if existing.id is null then
      begin
        insert into ratings (plan_id, spot_id, voter_name, stars, again, participant_token_hash, user_id)
        values (p_plan_id, p_spot_id, clean_name, p_stars, p_again, p_participant_token_hash, caller);
        return;
      exception when unique_violation then
      end;
    else
      update ratings set spot_id = p_spot_id, stars = p_stars, again = p_again,
        participant_token_hash = p_participant_token_hash, user_id = caller where id = existing.id;
      return;
    end if;
  end loop;
end; $$;

-- create or replace preserves the ACL, so 020/021's grants still stand.


-- ── 044: curated_categories ──────────────────────────────────────────────
--
-- The Discover filter tabs were derived from a truncated 120-row catalogue
-- read, so a category whose venues all sort late got no tab and became
-- unreachable. DISTINCT over the whole table is not expressible in PostgREST,
-- hence a view.
--
-- `security_invoker = true` is load-bearing: without it a view runs as its
-- OWNER and bypasses RLS, which would leak the categories of every private
-- custom spot. With it, the view inherits 041's scoping exactly, so there is
-- no second copy of the rule to drift.

drop view if exists public.curated_categories;
create view public.curated_categories
  with (security_invoker = true) as
  select distinct category
  from public.spots
  where source = 'curated';

-- Read-only by construction: a view over a select-only policy, granted
-- select only. No insert/update/delete grant, and nothing to write to.
grant select on public.curated_categories to anon, authenticated;

-- PostgREST caches the schema, so a newly created view is invisible to the
-- API until it reloads -- the first attempt to read it returns "Could not
-- find the table in the schema cache", which reads like the migration failed
-- when it did not. Ask for the reload here so applying this is one step.
notify pgrst, 'reload schema';


-- ── 045: REPLICA IDENTITY FULL for the Realtime publication ──────────────
--
-- INSERTs propagate under the default identity; DELETEs do not. A DELETE's
-- WAL record carries only the old row's replica identity, so under `default`
-- that is the primary key alone -- not enough for Realtime to evaluate the
-- subscription filter or the row's RLS, so it drops the event silently.
--
-- That is not an edge case here: `cast_plan_vote` with `p_value := false`
-- DELETEs the row, which is how someone clears a pick. Without this,
-- everyone else's screen keeps showing a vote that was withdrawn.
-- Measured with two browser contexts; see migration-045.
alter table votes      replica identity full;
alter table plans      replica identity full;
alter table rsvps      replica identity full;
alter table ratings    replica identity full;
alter table plan_spots replica identity full;

-- 047: delete_plan -- the plan's creator, holding the host token, deletes an
-- OPEN plan; children cascade; one audit row in security_events. Kept verbatim
-- in sync with supabase/migration-047-delete-plan.sql, which carries the reasoning.
create or replace function delete_plan(p_plan_id uuid, p_host_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  target plans%rowtype;
  stored_hash text;
  participants int;
begin
  -- Same permanent-account gate as create_secure_plan: the route refuses
  -- anonymous sessions, and this holds for a direct PostgREST call too.
  if auth.uid() is null or coalesce(auth.jwt()->>'is_anonymous', 'false') = 'true' then
    raise exception 'Sign in required' using errcode = '42501';
  end if;

  select * into target from plans where id = p_plan_id for update;
  if target.id is null then
    return jsonb_build_object('result', 'not_found');
  end if;

  select token_hash into stored_hash from plan_host_tokens where plan_id = p_plan_id;
  if target.created_by_user_id is distinct from auth.uid()
     or p_host_token is null or length(p_host_token) < 32 or stored_hash is null
     or stored_hash <> encode(digest(p_host_token, 'sha256'), 'hex') then
    return jsonb_build_object('result', 'not_host');
  end if;

  if target.status <> 'open' then
    return jsonb_build_object('result', 'already_decided');
  end if;

  select count(distinct who) into participants from (
    select coalesce(user_id::text, participant_token_hash, voter_name) as who from votes where plan_id = p_plan_id
    union
    select coalesce(user_id::text, participant_token_hash, voter_name) from rsvps where plan_id = p_plan_id
  ) p;

  delete from plans where id = p_plan_id;

  insert into security_events (event_type, outcome, actor_user_id, metadata)
  values ('plan_command', 'success', auth.uid(),
    jsonb_build_object('command', 'delete', 'plan_id', p_plan_id, 'participants', participants));

  return jsonb_build_object('result', 'deleted', 'participants', participants);
end;
$$;

-- Named grants, not just public (the 021/024 trap). Signed-in sessions only.
revoke all on function delete_plan(uuid, text) from public, anon, authenticated;
grant execute on function delete_plan(uuid, text) to authenticated;

-- 048: friendships need consent from both people -- the only way to create an
-- edge is an invite the inviter created and the redeemer presents. Supersedes
-- the "add own friendships" policies created above. Kept verbatim in sync with
-- supabase/migration-048-friendship-consent.sql, which carries the reasoning.
drop policy if exists "add own friendships" on friendships;
-- Belt and braces: with no insert policy RLS already refuses, but the table
-- grant should not claim a write path that does not exist.
revoke insert on friendships from anon, authenticated;

-- Secret table: RLS on, no policies, only the definer functions below touch it.
create table if not exists friend_invites (
  token_hash text primary key,
  inviter_id uuid not null references people(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days',
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists friend_invites_inviter_idx on friend_invites (inviter_id, expires_at);
alter table friend_invites enable row level security;

-- Returns the raw token exactly once; only its sha256 is stored.
create or replace function create_friend_invite()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  uid uuid := auth.uid();
  token text;
  expires timestamptz;
begin
  if not is_permanent_user() then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  if not exists (select 1 from people where id = uid and auth_user_id = uid) then
    raise exception 'Create a profile first' using errcode = '42501';
  end if;
  -- ponytail: count-based cap per inviter; a time-windowed quota if invites get abused.
  if (select count(*) from friend_invites
      where inviter_id = uid and used_at is null and expires_at > now()) >= 20 then
    raise exception 'Too many open invites' using errcode = '54000';
  end if;

  token := encode(gen_random_bytes(32), 'hex');
  insert into friend_invites (token_hash, inviter_id)
  values (encode(digest(token, 'sha256'), 'hex'), uid)
  returning expires_at into expires;
  return jsonb_build_object('token', token, 'expires_at', expires);
end;
$$;

-- Result codes, never a silent no-op:
--   friends          edge created
--   already_friends  edge existed; token consumed, nothing duplicated
--   self             your own invite; token left unused
--   invalid          unknown, used or expired (not distinguished, on purpose)
create or replace function redeem_friend_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  uid uuid := auth.uid();
  invite friend_invites%rowtype;
  created int;
begin
  if not is_permanent_user() then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  if not exists (select 1 from people where id = uid and auth_user_id = uid) then
    raise exception 'Create a profile first' using errcode = '42501';
  end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('result', 'invalid');
  end if;

  select * into invite from friend_invites
  where token_hash = encode(digest(p_token, 'sha256'), 'hex')
  for update;
  if invite.token_hash is null or invite.used_at is not null or invite.expires_at <= now() then
    return jsonb_build_object('result', 'invalid');
  end if;
  if invite.inviter_id = uid then
    return jsonb_build_object('result', 'self');
  end if;

  update friend_invites set used_at = now() where token_hash = invite.token_hash;
  -- mirror_friendship writes the reverse edge.
  insert into friendships (person_id, friend_id) values (invite.inviter_id, uid)
  on conflict do nothing;
  get diagnostics created = row_count;

  return jsonb_build_object(
    'result', case when created = 1 then 'friends' else 'already_friends' end,
    'friend_id', invite.inviter_id);
end;
$$;

-- Shows the redeemer WHO they would befriend before they accept (security
-- review of 048): without it a confirm screen can only say "Add friend?" or
-- trust a name carried in the link. Reveals the inviter's display name and
-- emoji to whoever holds their token, which the inviter chose to share.
create or replace function preview_friend_invite(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  inviter people%rowtype;
begin
  if not is_permanent_user() then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('result', 'invalid');
  end if;
  select p.* into inviter from friend_invites i join people p on p.id = i.inviter_id
  where i.token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and i.used_at is null and i.expires_at > now();
  if inviter.id is null then
    return jsonb_build_object('result', 'invalid');
  end if;
  return jsonb_build_object('result', case when inviter.id = auth.uid() then 'self' else 'valid' end,
    'display_name', inviter.display_name, 'emoji', inviter.emoji);
end;
$$;

revoke all on function create_friend_invite() from public, anon, authenticated;
grant execute on function create_friend_invite() to authenticated;
revoke all on function redeem_friend_invite(text) from public, anon, authenticated;
grant execute on function redeem_friend_invite(text) to authenticated;
revoke all on function preview_friend_invite(text) from public, anon, authenticated;
grant execute on function preview_friend_invite(text) to authenticated;

-- 049: co-members cannot read each other's user_id. Do not apply the
-- migration before the plan page's explicit column lists are deployed; see
-- supabase/migration-049-hide-voter-user-id.sql.
revoke select on votes, rsvps, ratings from anon, authenticated;

grant select (id, plan_id, spot_id, voter_name, value, phase, pool_number,
  participant_token_hash, created_at) on votes to authenticated;
grant select (id, plan_id, voter_name, coming, choice, participant_token_hash,
  transport, seats_available, created_at) on rsvps to authenticated;
grant select (id, plan_id, spot_id, voter_name, stars, again,
  participant_token_hash, created_at) on ratings to authenticated;

-- 050: owner-only reads that don't need the uid column. See
-- supabase/migration-050-owner-reads-without-uid.sql.
create or replace function public.my_custom_spots()
returns table (id uuid, name text, area text, category text, visibility text, minimum_age smallint)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.name, s.area, s.category, s.visibility, s.minimum_age
  from public.spots s
  where s.source = 'custom' and s.created_by_user_id = auth.uid()
  order by s.name;
$$;

create or replace function public.count_my_hosted_plans(p_from timestamptz, p_to timestamptz)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) from public.plans p
  where p.created_by_user_id = auth.uid() and p.created_at >= p_from and p.created_at < p_to;
$$;

revoke all on function public.my_custom_spots() from public, anon, authenticated;
grant execute on function public.my_custom_spots() to authenticated;
revoke all on function public.count_my_hosted_plans(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.count_my_hosted_plans(timestamptz, timestamptz) to authenticated;

-- 051: clients cannot read created_by_user_id on spots or plans. Do not apply
-- the migration before 050 and T2's client changes; see
-- supabase/migration-051-hide-creator-user-id.sql.
revoke select on spots, plans from anon, authenticated;

grant select (id, name, category, minimum_age, area, cuisine, price_band,
  min_spend, open_till, vibe, photo_url, photo_source, photo_attribution,
  description, booking_url, source, visibility, address, latitude, longitude)
  on spots to anon, authenticated;

grant select (id, title, category, area, deadline, status, stage, pool_count,
  budget_per_person, origin_label, origin_latitude, origin_longitude, radius_km,
  smart_brief, vibe_preferences, avoid_preferences, intelligence_model,
  winner_spot_id, event_time, booking_owner, booked, created_at, reopened_at)
  on plans to authenticated;

-- 052: display names sanitised by clean_display_name (trigger + CHECK), emoji
-- unset = NULL, edit own visits (column-scoped), unrate_plan. See
-- supabase/migration-052-been-edits-and-unrate.sql.
-- ── 1. Display names: one sanitiser, used by the trigger AND the CHECK ─────
-- Names reach strangers through preview_friend_invite, so a name that LOOKS
-- like a friend's but differs is an impersonation tool. clean_display_name is
-- the single definition: people_before_write applies it, and the CHECK
-- requires display_name = clean_display_name(display_name), so the two can
-- never disagree (security reviews of 052).
--   - every Unicode space (NBSP, hair/thin/ideographic spaces, line and
--     paragraph separators…) becomes a plain space; runs collapse to one
--   - control and bidi characters are removed (as clean_app_text does)
--   - invisible format characters are removed: soft hyphen, CGJ, Arabic letter
--     mark, Hangul/Khmer/Mongolian fillers, ZWSP, word joiner and invisible
--     operators, deprecated format chars, BOM, variation selectors except VS16
--     (emoji need it), tag characters
--   - ZWJ/ZWNJ are KEPT where scripts and emoji need them (Persian ZWNJ,
--     Indic, family emoji) and removed only where they impersonate: at either
--     end, next to an ASCII character, or repeated
--   - trimmed, cut to 40 characters, and cleaned again at the new end
-- Known limits: homoglyphs (Cyrillic а vs Latin a) and a ZWJ between two
-- letters that already join in Arabic script. Stripping cannot solve those;
-- the invite preview's shared-plans signal (054) is the answer to them.
-- Changing this function later does NOT re-check existing rows; normalise
-- them in the same migration.
-- ⚠ MUST STAY EXECUTABLE BY authenticated (default PUBLIC execute): the CHECK
-- below calls it on every people write, so a future revoke sweep like 021/024
-- that includes it would make sign-up and rename fail with 42501. It reads no
-- tables and discloses nothing.
-- Control characters are explicit code-point ranges, not [[:cntrl:]], which
-- depends on the collation's ctype and would make IMMUTABLE untrue.
create or replace function clean_display_name(value text)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  zw constant text := '[' || chr(8204) || chr(8205) || ']';
  s text := coalesce(value, '');
begin
  s := regexp_replace(s, '[' || chr(160) || chr(5760) || chr(8192) || '-' || chr(8202)
         || chr(8232) || chr(8233) || chr(8239) || chr(8287) || chr(12288) || ']', ' ', 'g');
  s := translate(s,
         chr(8206) || chr(8207) || chr(8234) || chr(8235) || chr(8236) || chr(8237) || chr(8238)
         || chr(8294) || chr(8295) || chr(8296) || chr(8297)
         || chr(173) || chr(847) || chr(1564) || chr(4447) || chr(4448) || chr(6068) || chr(6069)
         || chr(6158) || chr(8203) || chr(8288) || chr(8289) || chr(8290) || chr(8291) || chr(8292)
         || chr(8298) || chr(8299) || chr(8300) || chr(8301) || chr(8302) || chr(8303)
         || chr(12644) || chr(65279) || chr(65440), '');
  s := regexp_replace(s, '[' || chr(1) || '-' || chr(31) || chr(127) || '-' || chr(159)
         || chr(1536) || '-' || chr(1541) || chr(1757) || chr(1807) || chr(2274)
         || chr(6155) || '-' || chr(6157) || chr(6159) || chr(10240)
         || chr(65529) || '-' || chr(65531)
         || chr(65024) || '-' || chr(65038)
         || chr(69821) || chr(69837) || chr(78896) || '-' || chr(78911)
         || chr(113824) || '-' || chr(113827) || chr(119155) || '-' || chr(119162)
         || chr(917504) || '-' || chr(917631)
         || chr(917760) || '-' || chr(917999) || ']', '', 'g');
  s := regexp_replace(s, zw || '{2,}', '', 'g');
  s := regexp_replace(s, '(?<=[' || chr(1) || '-' || chr(127) || '])' || zw || '+', '', 'g');
  s := regexp_replace(s, zw || '+(?=[' || chr(1) || '-' || chr(127) || '])', '', 'g');
  s := regexp_replace(s, ' {2,}', ' ', 'g');
  s := btrim(regexp_replace(s, '^' || zw || '+|' || zw || '+$', '', 'g'));
  s := left(s, 40);
  return btrim(regexp_replace(s, '^' || zw || '+|' || zw || '+$', '', 'g'));
end;
$$;

-- Normalise any existing names first so adding the CHECK cannot fail on old
-- rows (live had 0 people when written). A name that cleans to nothing
-- becomes 'Friend'.
update people set display_name = coalesce(nullif(clean_display_name(display_name), ''), 'Friend')
where display_name is distinct from coalesce(nullif(clean_display_name(display_name), ''), 'Friend');

alter table people drop constraint if exists people_display_name_safe;
alter table people add constraint people_display_name_safe
  check (display_name = clean_display_name(display_name));

create or replace function people_before_write() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  -- Names: the one sanitiser (see clean_display_name). An all-invisible name
  -- ends up empty: a new profile falls back to 'Friend' (as
  -- ensure_authenticated_profile always has), a rename to nothing fails the
  -- length check.
  new.display_name := clean_display_name(new.display_name);
  if tg_op = 'INSERT' and new.display_name = '' then
    new.display_name := 'Friend';
  end if;
  -- Emoji: sanitised, then '' and '?' mean "not chosen" (NULL). Handled here,
  -- the one path every write takes (review L3). Trim again after the cut so a
  -- truncated value can't end in spaces (review L1).
  new.emoji        := nullif(nullif(trim(public.clean_app_text(new.emoji, 8)), ''), '?');
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

-- ── 1b. "No emoji chosen" is NULL, one representation ─────────────────────
-- ensure_authenticated_profile (020) ignored its p_emoji/p_color arguments and
-- hardcoded '?', while the column defaulted to '🙂': two "unset" values in one
-- column, and '?' rendered literally ("? walk2-host") and collided with a user
-- who really types "?". Now: NULL means not chosen; the existing length and
-- safety CHECKs pass on NULL. Colour keeps '#34363b', what real accounts have.
alter table people alter column emoji drop not null;
alter table people alter column emoji set default null;
alter table people alter column color set default '#34363b';
update people set emoji = null where emoji = '?';

-- Same auth and conflict behaviour as 020's version. New: a passed emoji or
-- colour is honoured. The emoji is sanitised by people_before_write (control/
-- bidi stripped, ZWJ/VS16 kept, max 8; '' and '?' become NULL, so a
-- not-yet-updated client sending '?' writes NULL). Colour must be #rrggbb or it
-- falls back to the default. Hostile input never reaches a CHECK violation.
create or replace function ensure_authenticated_profile(
  p_display_name text, p_emoji text default null, p_color text default '#34363b'
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  profile_id uuid;
begin
  if uid is null or not is_permanent_user() then raise exception 'Permanent account required' using errcode='42501'; end if;
  select id into profile_id from people where auth_user_id = uid;
  if profile_id is not null then return profile_id; end if;
  insert into people(id, display_name, emoji, color, auth_user_id)
  values(uid, coalesce(nullif(clean_app_text(p_display_name,40),''),'Friend'), p_emoji,
         case when p_color ~ '^#[0-9a-fA-F]{6}$' then lower(p_color) else '#34363b' end, uid)
  on conflict(auth_user_id) do update set auth_user_id=excluded.auth_user_id returning id into profile_id;
  return profile_id;
end; $$;
revoke all on function ensure_authenticated_profile(text,text,text) from public, anon;
grant execute on function ensure_authenticated_profile(text,text,text) to authenticated;

-- ── 2. Edit your own visit ───────────────────────────────────────────────
-- visits had no UPDATE policy, so an edit updated 0 rows with no error: a
-- save that silently did nothing. Owner-only, same person_id = auth.uid()
-- shape as 028 (people.id is always auth.uid()). Only the descriptive
-- columns are editable: changing the place or plan is delete + relog.
drop policy if exists "edit own visits" on visits;
create policy "edit own visits" on visits for update to authenticated
  using (is_permanent_user() and person_id = (select auth.uid()))
  with check (is_permanent_user() and person_id = (select auth.uid()));

revoke update on visits from anon, authenticated;
grant update (visited_at, group_label, note) on visits to authenticated;

-- ── 3. Remove your own rating ────────────────────────────────────────────
-- rate_plan only accepts 1–5 stars, so there was no way back. Matches on
-- the caller's uid ONLY: participant_token_hash is readable by co-members, so
-- a hash-based match would let one member remove another's rating. Pre-043
-- ratings (user_id null) therefore cannot be removed this way.
-- Accepted (review L3): unrating frees your voter_name on that plan, so a
-- co-member could later rate under that name; the name was equally free
-- before you first rated.
create or replace function unrate_plan(p_plan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  removed int;
begin
  if auth.uid() is null then
    raise exception 'Participant authorization required' using errcode = '42501';
  end if;
  delete from ratings where plan_id = p_plan_id and user_id = auth.uid();
  get diagnostics removed = row_count;
  return jsonb_build_object('result', case when removed > 0 then 'removed' else 'not_rated' end);
end;
$$;

revoke all on function unrate_plan(uuid) from public, anon, authenticated;
grant execute on function unrate_plan(uuid) to authenticated;

-- 054: friend invite trust signal (shared_plans) and race-free open-invite cap.
-- create_friend_invite must stay VOLATILE (see the migration header).
-- See supabase/migration-054-invite-trust-and-cap-lock.sql.
create or replace function create_friend_invite()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  uid uuid := auth.uid();
  token text;
  expires timestamptz;
begin
  if not is_permanent_user() then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  if not exists (select 1 from people where id = uid and auth_user_id = uid) then
    raise exception 'Create a profile first' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('friend_invite:' || uid::text, 0));

  delete from friend_invites
  where inviter_id = uid
    and (expires_at < now() or used_at is not null)
    and created_at < now() - interval '7 days';

  if (select count(*) from friend_invites
      where inviter_id = uid and used_at is null and expires_at > now()) >= 20 then
    raise exception 'Too many open invites' using errcode = '54000';
  end if;

  token := encode(gen_random_bytes(32), 'hex');
  insert into friend_invites (token_hash, inviter_id)
  values (encode(digest(token, 'sha256'), 'hex'), uid)
  returning expires_at into expires;
  return jsonb_build_object('token', token, 'expires_at', expires);
end;
$$;

create or replace function preview_friend_invite(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  inviter people%rowtype;
begin
  if not is_permanent_user() then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('result', 'invalid');
  end if;
  select p.* into inviter from friend_invites i join people p on p.id = i.inviter_id
  where i.token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and i.used_at is null and i.expires_at > now();
  if inviter.id is null then
    return jsonb_build_object('result', 'invalid');
  end if;
  if inviter.id = auth.uid() then
    return jsonb_build_object('result', 'self', 'display_name', inviter.display_name, 'emoji', inviter.emoji);
  end if;
  return jsonb_build_object(
    'result', 'valid',
    'display_name', inviter.display_name,
    'emoji', inviter.emoji,
    'shared_plans', (
      select count(*) from plan_access a
      join plan_access b on b.plan_id = a.plan_id
      where a.user_id = inviter.id and b.user_id = auth.uid()
    ));
end;
$$;

-- 055: edit_plan -- host renames a plan or moves its deadline before voting.
-- See supabase/migration-055-edit-plan.sql (accepted race documented there).
create or replace function edit_plan(
  p_plan_id uuid,
  p_host_token text,
  p_title text default null,
  p_deadline timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  target plans%rowtype;
  stored_hash text;
  new_title text;
begin
  if auth.uid() is null or coalesce(auth.jwt()->>'is_anonymous', 'false') = 'true' then
    raise exception 'Sign in required' using errcode = '42501';
  end if;

  select * into target from plans where id = p_plan_id for update;
  if target.id is null then
    return jsonb_build_object('result', 'not_found');
  end if;

  select token_hash into stored_hash from plan_host_tokens where plan_id = p_plan_id;
  if target.created_by_user_id is distinct from auth.uid()
     or p_host_token is null or length(p_host_token) < 32 or stored_hash is null
     or stored_hash <> encode(digest(p_host_token, 'sha256'), 'hex') then
    return jsonb_build_object('result', 'not_host');
  end if;

  if target.status <> 'open' or target.stage <> 'pool'
     or exists (select 1 from votes where plan_id = p_plan_id) then
    return jsonb_build_object('result', 'voting_started');
  end if;

  if p_title is not null then
    new_title := clean_app_text(p_title, 60);
    if new_title = '' or clean_display_name(new_title) = '' then
      return jsonb_build_object('result', 'invalid_title');
    end if;
  end if;

  if p_deadline is not null and (p_deadline <= now() or p_deadline > now() + interval '1 year') then
    return jsonb_build_object('result', 'invalid_deadline');
  end if;

  if (new_title is null or new_title = target.title)
     and (p_deadline is null or p_deadline = target.deadline) then
    return jsonb_build_object('result', 'nothing_to_change');
  end if;

  update plans set
    title = coalesce(new_title, title),
    deadline = coalesce(p_deadline, deadline)
  where id = p_plan_id
  returning * into target;

  return jsonb_build_object('result', 'edited', 'title', target.title, 'deadline', target.deadline);
end;
$$;

revoke all on function edit_plan(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function edit_plan(uuid, text, text, timestamptz) to authenticated;

-- 056: leave_plan -- a member (not the host) leaves; open vs decided rules and
-- the accepted vote/leave race are in supabase/migration-056-leave-plan.sql.
create or replace function leave_plan(p_plan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  target plans%rowtype;
  leaver_name text;
begin
  if uid is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;

  select * into target from plans where id = p_plan_id for update;
  if target.id is null then
    return jsonb_build_object('result', 'not_found');
  end if;
  if target.created_by_user_id = uid then
    return jsonb_build_object('result', 'host_cannot_leave');
  end if;
  if not exists (select 1 from plan_access where plan_id = p_plan_id and user_id = uid) then
    return jsonb_build_object('result', 'not_member');
  end if;

  select voter_name into leaver_name from rsvps where plan_id = p_plan_id and user_id = uid;
  if leaver_name is not null and target.booking_owner = leaver_name and target.booked is not true then
    update plans set booking_owner = null where id = p_plan_id;
  end if;

  if target.status = 'open' then
    delete from votes where plan_id = p_plan_id and user_id = uid;
  end if;
  delete from rsvps where plan_id = p_plan_id and user_id = uid;
  if target.status <> 'open' then
    delete from ratings where plan_id = p_plan_id and user_id = uid;
  end if;
  delete from plan_access where plan_id = p_plan_id and user_id = uid;

  return jsonb_build_object('result', 'left');
end;
$$;

revoke all on function leave_plan(uuid) from public, anon, authenticated;
grant execute on function leave_plan(uuid) to authenticated;

-- 058: create_secure_plan and create_direct_plan (above) refuse invisible-only
-- titles; see supabase/migration-058-plan-creation-invisible-titles.sql.

-- 057: reopen_plan -- the host reopens a decided plan into its final round.
-- Refusals, kept state, deadline rule and accepted race: see
-- supabase/migration-057-reopen-plan.sql.
create or replace function reopen_plan(
  p_plan_id uuid,
  p_host_token text,
  p_deadline timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  target plans%rowtype;
  stored_hash text;
begin
  if auth.uid() is null or coalesce(auth.jwt()->>'is_anonymous', 'false') = 'true' then
    raise exception 'Sign in required' using errcode = '42501';
  end if;

  select * into target from plans where id = p_plan_id for update;
  if target.id is null then
    return jsonb_build_object('result', 'not_found');
  end if;

  select token_hash into stored_hash from plan_host_tokens where plan_id = p_plan_id;
  if target.created_by_user_id is distinct from auth.uid()
     or p_host_token is null or length(p_host_token) < 32 or stored_hash is null
     or stored_hash <> encode(digest(p_host_token, 'sha256'), 'hex') then
    return jsonb_build_object('result', 'not_host');
  end if;

  if target.status <> 'decided' then
    return jsonb_build_object('result', 'not_decided');
  end if;
  -- Direct plans insert their single spot with advanced = true: fewer than two
  -- advanced finalists means there is nothing to re-vote on.
  if (select count(*) from plan_spots where plan_id = p_plan_id and advanced) < 2 then
    return jsonb_build_object('result', 'no_rounds');
  end if;
  if target.booked is true then
    return jsonb_build_object('result', 'booked');
  end if;
  if exists (select 1 from ratings where plan_id = p_plan_id)
     or exists (select 1 from visits where plan_id = p_plan_id) then
    return jsonb_build_object('result', 'already_happened');
  end if;
  if p_deadline is not null and (p_deadline <= now() or p_deadline > now() + interval '1 year') then
    return jsonb_build_object('result', 'invalid_deadline');
  end if;

  delete from votes v
  where v.plan_id = p_plan_id and v.user_id is not null
    and not exists (select 1 from plan_access a where a.plan_id = p_plan_id and a.user_id = v.user_id);

  update plans set
    status = 'open',
    stage = 'final',
    winner_spot_id = null,
    deadline = p_deadline,
    reopened_at = now()
  where id = p_plan_id;

  insert into security_events (event_type, outcome, actor_user_id, metadata)
  values ('plan_command', 'success', auth.uid(),
    jsonb_build_object('command', 'reopen', 'plan_id', p_plan_id));

  return jsonb_build_object('result', 'reopened', 'deadline', p_deadline);
end;
$$;

revoke all on function reopen_plan(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function reopen_plan(uuid, text, timestamptz) to authenticated;

-- 059: age gates from one list (category_age_gates) used by plan creation, and
-- correct_birth_date. See supabase/migration-059-birth-date-correction-and-age-gates.sql.
create or replace function category_age_gates()
returns table (category text, minimum_age smallint)
language sql immutable set search_path = pg_catalog as $$
  values ('shisha'::text, 18::smallint), ('nightlife', 21), ('vibes', 21), ('beach_club', 21)
$$;

create or replace function category_min_age(p_category text)
returns smallint
language sql immutable set search_path = public, pg_temp as $$
  select coalesce((select g.minimum_age from category_age_gates() g where g.category = p_category), 0::smallint)
$$;

create or replace function spot_required_age(p_category text, p_spot_minimum_age smallint)
returns integer
language sql immutable set search_path = public, pg_temp as $$
  select greatest(coalesce(p_spot_minimum_age, 0), category_min_age(p_category))::integer
$$;

-- Only the definer functions below call these.
revoke all on function category_age_gates() from public, anon, authenticated;
revoke all on function category_min_age(text) from public, anon, authenticated;
revoke all on function spot_required_age(text, smallint) from public, anon, authenticated;

alter table member_ages add column if not exists corrected_at timestamptz;

create or replace function correct_birth_date(p_date_of_birth date)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set timezone = 'Asia/Dubai'
as $$
declare
  uid uuid := auth.uid();
  current_dob date;
  already timestamptz;
  current_age integer;
  new_age integer;
  highest_gate integer;
  gates_from integer;
  gates_to integer;
begin
  if uid is null or not is_permanent_user() then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  select date_of_birth, corrected_at into current_dob, already
  from member_ages where user_id = uid for update;
  if current_dob is null then
    return jsonb_build_object('result', 'not_on_file');
  end if;
  if already is not null then
    return jsonb_build_object('result', 'already_corrected');
  end if;
  if p_date_of_birth is null or p_date_of_birth > current_date then
    return jsonb_build_object('result', 'invalid_date');
  end if;
  new_age := extract(year from age(current_date, p_date_of_birth));
  if new_age < 13 or new_age > 120 then
    return jsonb_build_object('result', 'invalid_date');
  end if;
  if p_date_of_birth = current_dob then
    return jsonb_build_object('result', 'no_change');
  end if;

  current_age := extract(year from age(current_date, current_dob));
  if p_date_of_birth < current_dob then
    highest_gate := greatest(
      (select max(g.minimum_age) from category_age_gates() g),
      coalesce((select max(s.minimum_age) from spots s where s.source = 'curated'), 0));
    if current_age < highest_gate then
      -- The refused attempt is the one this function defends against: log it.
      insert into security_events (event_type, outcome, actor_user_id, metadata)
      values ('authorization', 'blocked', uid,
        jsonb_build_object('command', 'correct_birth_date', 'direction', 'older', 'result', 'crosses_age_gate'));
      return jsonb_build_object('result', 'crosses_age_gate');
    end if;
  end if;

  update member_ages set date_of_birth = p_date_of_birth, corrected_at = now() where user_id = uid;

  select count(distinct g.minimum_age) filter (where g.minimum_age <= current_age),
         count(distinct g.minimum_age) filter (where g.minimum_age <= new_age)
  into gates_from, gates_to from category_age_gates() g;
  insert into security_events (event_type, outcome, actor_user_id, metadata)
  values ('authorization', 'success', uid, jsonb_build_object(
    'command', 'correct_birth_date',
    'direction', case when p_date_of_birth < current_dob then 'older' else 'younger' end,
    'gates_passed_from', gates_from, 'gates_passed_to', gates_to));

  return jsonb_build_object('result', 'corrected');
end;
$$;

revoke all on function correct_birth_date(date) from public, anon, authenticated;
grant execute on function correct_birth_date(date) to authenticated;

-- 060: delete my account (C3) -- ownerless custom spots, own-files storage
-- policy, and delete_my_account(). See migration-060 for the full rules.

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


-- ── 061: one ballot per account, deadline enforced, guest limits ─────────
--
-- Identity for votes/rsvps/ratings is the auth user, not the caller-chosen
-- participant_token_hash (one session could mint unlimited hashes = unlimited
-- votes) nor the typed name. cast_plan_vote refuses after plans.deadline;
-- host commands are unaffected. Guests cannot upload visit photos; visit_photos
-- rows and files need a session. user_id stays nullable: 060 anonymises votes
-- to null and the FKs are ON DELETE SET NULL. The live migration also dedupes
-- (keeps the latest row per key) before building these; see migration-061.

create unique index votes_user_round_key
  on votes (plan_id, user_id, phase, pool_number) where user_id is not null;
create unique index rsvps_user_key
  on rsvps (plan_id, user_id) where user_id is not null;
create unique index ratings_user_key
  on ratings (plan_id, user_id) where user_id is not null;

create or replace function cast_plan_vote(
  p_plan_id uuid, p_spot_id uuid, p_voter_name text, p_value boolean,
  p_phase text, p_pool_number smallint, p_participant_token_hash text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target plans%rowtype;
  clean_name text := clean_display_name(p_voter_name);
  caller uuid := auth.uid();
begin
  if caller is null or p_participant_token_hash is null
     or p_participant_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Participant authorization required' using errcode = '42501';
  end if;
  if exists (
    select 1 from votes v
    where v.plan_id = p_plan_id and v.participant_token_hash = p_participant_token_hash
      and v.user_id is distinct from caller
  ) then
    raise exception 'That participant identity belongs to someone else' using errcode = '42501';
  end if;
  if clean_name = '' then
    raise exception 'Enter a name before voting' using errcode = '22023';
  end if;
  if p_phase is null or p_phase not in ('pool', 'final') or p_pool_number is null then
    raise exception 'Unsupported voting phase' using errcode = '22023';
  end if;

  select * into target from plans where id = p_plan_id;
  if target.id is null or target.status <> 'open' then
    raise exception 'This plan is not open for voting' using errcode = '22023';
  end if;
  if target.deadline is not null and target.deadline <= now() then
    raise exception 'Voting on this plan has closed' using errcode = '22023';
  end if;
  if p_phase <> target.stage then
    raise exception 'This round is no longer open' using errcode = '22023';
  end if;
  if p_phase = 'pool' and (p_pool_number < 1 or p_pool_number > target.pool_count) then
    raise exception 'That round does not exist' using errcode = '22023';
  end if;
  if p_phase = 'final' and p_pool_number <> 0 then
    raise exception 'That round does not exist' using errcode = '22023';
  end if;
  if not exists (
    select 1 from plan_spots ps
    where ps.plan_id = p_plan_id and ps.spot_id = p_spot_id
      and (p_phase = 'final' or ps.pool_number = p_pool_number)
      and (p_phase = 'pool' or ps.advanced)
  ) then
    raise exception 'That place is not on this plan' using errcode = '22023';
  end if;

  if p_value then
    insert into votes (plan_id, spot_id, voter_name, value, phase, pool_number, participant_token_hash, user_id)
    values (p_plan_id, p_spot_id, clean_name, true, p_phase, p_pool_number, p_participant_token_hash, caller)
    on conflict (plan_id, user_id, phase, pool_number) where user_id is not null
      do update set spot_id = excluded.spot_id, voter_name = excluded.voter_name,
                    value = true, participant_token_hash = excluded.participant_token_hash;
  else
    delete from votes
      where plan_id = p_plan_id and user_id = caller
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
  p_plan_id uuid, p_voter_name text, p_coming boolean, p_choice text, p_participant_token_hash text,
  p_transport text default null, p_seats_available smallint default null
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing rsvps%rowtype;
  target plans%rowtype;
  clean_name text := clean_display_name(p_voter_name);
  caller uuid := auth.uid();
begin
  if caller is null or p_participant_token_hash is null
     or p_participant_token_hash !~ '^[0-9a-f]{64}$'
     or p_choice is null or p_choice not in ('coming', 'maybe', 'no') then
    raise exception 'Participant authorization required' using errcode = '42501';
  end if;
  if exists (
    select 1 from rsvps r
    where r.plan_id = p_plan_id and r.participant_token_hash = p_participant_token_hash
      and r.user_id is distinct from caller
  ) then
    raise exception 'That participant identity belongs to someone else' using errcode = '42501';
  end if;
  if clean_name = '' then
    raise exception 'Enter a name before replying' using errcode = '22023';
  end if;
  if p_transport is not null and p_transport not in ('driving', 'need_ride', 'own_way') then
    raise exception 'Unsupported transport choice' using errcode = '22023';
  end if;
  if p_seats_available is not null and (p_transport is distinct from 'driving' or p_seats_available not between 0 and 8) then
    raise exception 'Seats only apply when driving, 0 to 8' using errcode = '22023';
  end if;

  select * into target from plans where id = p_plan_id;
  if target.id is null then
    raise exception 'That plan does not exist' using errcode = '22023';
  end if;

  -- The caller's one row, found by uid. A unique_violation on insert means a
  -- concurrent call won either key; the next pass re-reads and re-checks.
  -- Bounded, so a key collision the re-check cannot see fails instead of spinning.
  for attempt in 1..3 loop
    select * into existing from rsvps where plan_id = p_plan_id and user_id = caller for update;
    if exists (select 1 from rsvps r where r.plan_id = p_plan_id and r.voter_name = clean_name
               and r.user_id is distinct from caller) then
      raise exception 'That participant name is already in use' using errcode = '42501';
    end if;
    if existing.id is null then
      begin
        insert into rsvps (plan_id, voter_name, coming, choice, participant_token_hash, transport, seats_available, user_id)
        values (p_plan_id, clean_name, p_coming, p_choice, p_participant_token_hash, p_transport, p_seats_available, caller);
        return;
      exception when unique_violation then
      end;
    else
      update rsvps set voter_name = clean_name, coming = p_coming, choice = p_choice,
        participant_token_hash = p_participant_token_hash,
        transport = p_transport, seats_available = p_seats_available
        where id = existing.id;
      return;
    end if;
  end loop;
  raise exception 'Busy, try again' using errcode = '40001';
end; $$;

create or replace function rate_plan(
  p_plan_id uuid, p_spot_id uuid, p_voter_name text, p_stars integer, p_again boolean, p_participant_token_hash text
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing ratings%rowtype;
  target plans%rowtype;
  clean_name text := clean_display_name(p_voter_name);
  caller uuid := auth.uid();
begin
  if caller is null or p_participant_token_hash is null
     or p_participant_token_hash !~ '^[0-9a-f]{64}$'
     or p_stars is null or p_stars not between 1 and 5 then
    raise exception 'Participant authorization required' using errcode = '42501';
  end if;
  if exists (
    select 1 from ratings r
    where r.plan_id = p_plan_id and r.participant_token_hash = p_participant_token_hash
      and r.user_id is distinct from caller
  ) then
    raise exception 'That participant identity belongs to someone else' using errcode = '42501';
  end if;
  if clean_name = '' then
    raise exception 'Enter a name before rating' using errcode = '22023';
  end if;

  select * into target from plans where id = p_plan_id;
  if target.id is null or target.status <> 'decided' then
    raise exception 'This plan has not been decided yet' using errcode = '22023';
  end if;
  if target.winner_spot_id is null or target.winner_spot_id <> p_spot_id then
    raise exception 'You can only rate the place the group chose' using errcode = '22023';
  end if;

  for attempt in 1..3 loop
    select * into existing from ratings where plan_id = p_plan_id and user_id = caller for update;
    if exists (select 1 from ratings r where r.plan_id = p_plan_id and r.voter_name = clean_name
               and r.user_id is distinct from caller) then
      raise exception 'That participant name is already in use' using errcode = '42501';
    end if;
    if existing.id is null then
      begin
        insert into ratings (plan_id, spot_id, voter_name, stars, again, participant_token_hash, user_id)
        values (p_plan_id, p_spot_id, clean_name, p_stars, p_again, p_participant_token_hash, caller);
        return;
      exception when unique_violation then
      end;
    else
      update ratings set voter_name = clean_name, spot_id = p_spot_id, stars = p_stars, again = p_again,
        participant_token_hash = p_participant_token_hash
        where id = existing.id;
      return;
    end if;
  end loop;
  raise exception 'Busy, try again' using errcode = '40001';
end; $$;

-- Who can call these: signed-in sessions (guests included -- guests vote).
revoke all on function cast_plan_vote(uuid, uuid, text, boolean, text, smallint, text) from public, anon, authenticated;
revoke all on function set_plan_rsvp(uuid, text, boolean, text, text, text, smallint) from public, anon, authenticated;
revoke all on function rate_plan(uuid, uuid, text, integer, boolean, text) from public, anon, authenticated;
grant execute on function cast_plan_vote(uuid, uuid, text, boolean, text, smallint, text) to authenticated;
grant execute on function set_plan_rsvp(uuid, text, boolean, text, text, text, smallint) to authenticated;
grant execute on function rate_plan(uuid, uuid, text, integer, boolean, text) to authenticated;

-- ── 4. visit-photos uploads: permanent accounts only ──────────────────────
-- Who: a permanent (non-anonymous) session, into its own uid folder. A guest
-- session costs nothing to mint, and each could store unlimited 8MB files; no
-- guest flow uploads (visit_photos rows already need a people profile).
drop policy if exists "upload own visit photos" on storage.objects;
create policy "upload own visit photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'visit-photos' and public.is_permanent_user()
              and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ── 5. visit_photos: no read without a session ────────────────────────────
-- Who: any signed-in session, same visibility rule as before (community, own,
-- or a friend's 'friends' photo). anon no longer reads rows (person_id,
-- storage_path) or files. The app only reads these signed in (lib/social.ts).
drop policy if exists "read permitted visit photos" on visit_photos;
create policy "read permitted visit photos" on visit_photos for select to authenticated using (
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
drop policy if exists "read permitted visit photo files" on storage.objects;
create policy "read permitted visit photo files" on storage.objects for select to authenticated
  using (bucket_id = 'visit-photos' and exists (
    select 1 from public.visit_photos photo where photo.storage_path = name
  ));

