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

-- Social layer first: it references spots and plans.
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
);

create index spots_owner_idx on spots (created_by_user_id) where source = 'custom';

-- A plan == one share link. The uuid IS the slug in the URL.
create table plans (
  id             uuid primary key default gen_random_uuid(),
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

-- One row per voter choice in a pool or final. The round-aware unique key
-- prevents duplicate rows while preserving the complete tournament vote.
create table votes (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references plans(id) on delete cascade,
  spot_id    uuid not null references spots(id) on delete cascade,
  voter_name text not null,
  value      boolean not null,
  phase      text not null default 'final' check (phase in ('pool', 'final')),
  pool_number smallint not null default 0 check (pool_number between 0 and 6),
  created_at timestamptz not null default now(),
  unique (plan_id, spot_id, voter_name, phase, pool_number)
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

-- Voting: insert and update your own vote rows.
create policy "cast votes"   on votes for insert with check (true);
create policy "change votes" on votes for update using (true) with check (true);

-- RSVPs: commit and change your mind.
create policy "read rsvps"   on rsvps for select using (true);
create policy "cast rsvps"   on rsvps for insert with check (true);
create policy "change rsvps" on rsvps for update using (true) with check (true);

-- Ratings: rate the winner after the visit; change your mind.
create policy "read ratings"   on ratings for select using (true);
create policy "cast ratings"   on ratings for insert with check (true);
create policy "change ratings" on ratings for update using (true) with check (true);

-- Starting a plan (used by the create flow) + "decide for us" updates.
create policy "create plans"      on plans      for insert with check (true);
create policy "decide plans"      on plans      for update using (true) with check (true);
create policy "attach plan_spots" on plan_spots for insert with check (true);
create policy "advance plan_spots" on plan_spots for update using (true) with check (true);

-- Signed-in members can maintain their own saved custom-place library.
create policy "create custom spots" on spots for insert with check (
  source = 'custom' and created_by_user_id = auth.uid()
);
create policy "update own custom spots" on spots for update
  using (source = 'custom' and created_by_user_id = auth.uid())
  with check (source = 'custom' and created_by_user_id = auth.uid());
create policy "delete own custom spots" on spots for delete
  using (source = 'custom' and created_by_user_id = auth.uid());

-- "Shake it up": re-dealing a plan clears its old spots + votes.
create policy "clear plan_spots"  on plan_spots for delete using (true);
create policy "clear votes"       on votes      for delete using (true);

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

-- The social tables (people, friendships, visits, visit_companions) are
-- deliberately NOT in the publication. Adding a table broadcasts its rows
-- to every anon subscriber — an access-control decision, not a perf one.
-- The vote screen needs live updates because several people act on one
-- shared screen at once; a profile feed, a friends list and a visit log are
-- read-on-open and refetch fine. Revisit only if a genuinely live shared
-- surface ships, and treat it as a security decision then.
