-- ─────────────────────────────────────────────────────────────────
-- Migration 005 — the social layer: people, friendships, visits.
--
-- ADDITIVE AND SAFE TO RE-RUN. This file drops NOTHING except its own
-- policies/triggers (which it immediately recreates). It never touches
-- spots / plans / plan_spots / votes / rsvps / ratings, and it does not
-- alter voter_name anywhere. Plans in flight keep working untouched.
--
-- Identity model (decided with the user): a *device profile*, still no auth.
-- The browser generates a uuid + display name once (lib/device.ts) and
-- upserts a row here. `people.id` is therefore supplied BY THE CLIENT on
-- insert; the gen_random_uuid() default is only a safety net.
-- Upgrade path: `auth_user_id` is already here and nullable, so adopting
-- Supabase Auth later is a backfill, not a rewrite.
--
-- Visibility (decided with the user): anyone with a profile link can read
-- that profile's visits — same posture as plans ("you have the link").
-- There is deliberately NO friends-only read filtering.
--
-- ⚠ RUN 006 AFTER THIS FILE. supabase/migration-006-social-hardening.sql
-- carries the fixes from the `security` audit of this migration (bounds and
-- normalisation on people/visits/visit_companions, and making people.id /
-- people.auth_user_id unwritable by anon). This file alone is the audited-
-- but-unfixed state.
--
-- ⚠ `create table if not exists` below is re-run safe, but it SILENTLY
-- NO-OPS against a pre-existing table of a different shape — it does not
-- reconcile columns or constraints. If you ever suspect these tables were
-- created by an older version of this file, compare against
-- supabase/schema.sql (the end-state description) rather than trusting a
-- clean re-run here.
-- ─────────────────────────────────────────────────────────────────

-- ── people ────────────────────────────────────────────────────────
-- The first stable identity in this codebase. Note it does NOT replace
-- votes.voter_name / rsvps.voter_name / ratings.voter_name — those stay
-- free-typed strings and are untouched by this migration. The only bridge
-- is visits.plan_id (a visit can point back at the plan it came from).
create table if not exists people (
  id           uuid primary key default gen_random_uuid(), -- client-generated in practice
  display_name text not null check (char_length(trim(display_name)) between 1 and 40),
  emoji        text not null default '🙂',       -- lightweight avatar, no uploads
  color        text not null default '#6b34e0'   -- hex, matches the app palette
                 check (color ~ '^#[0-9a-fA-F]{6}$'),
  auth_user_id uuid unique,                      -- null in v1; the upgrade seam
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── friendships ───────────────────────────────────────────────────
-- SYMMETRIC, materialised as two directed rows (a→b and b→a), kept in
-- sync by the trigger below.
--
-- Why symmetric and not a one-directional follow: friendship here is
-- established by swapping personal invite links. Opening someone's link is
-- already a two-party act, and with no auth there is nobody to "accept" a
-- request — a pending/accept state would be theatre. So the link is the
-- handshake, and both edges are written at once.
--
-- Why two rows instead of one canonical (least, greatest) pair: "my
-- friends" is then a single index scan on the primary key
-- (person_id, friend_id) instead of an OR/UNION across two columns.
-- Read path: select ... from friendships where person_id = $me.
create table if not exists friendships (
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

-- Reverse lookups + keeps the on-delete-cascade from seq-scanning.
create index if not exists friendships_friend_idx on friendships (friend_id);

-- Mirror every insert/delete so the pair can never be half-written.
-- Terminates: the mirrored write is a no-op the second time round
-- (on conflict do nothing / 0 rows deleted), so no trigger fires again.
create or replace function mirror_friendship() returns trigger
language plpgsql as $$
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

drop trigger if exists friendships_mirror_ins on friendships;
create trigger friendships_mirror_ins
  after insert on friendships
  for each row execute function mirror_friendship();

drop trigger if exists friendships_mirror_del on friendships;
create trigger friendships_mirror_del
  after delete on friendships
  for each row execute function mirror_friendship();

-- ── visits ────────────────────────────────────────────────────────
-- "I went to this place." Stands alone OR originates from a decided plan.
--
--   plan_id is null       → logged by hand, no plan involved
--   plan_id is not null   → came from a decided plan's winner_spot_id
--
-- plan_id is `on delete set null` (NOT cascade, unlike votes/rsvps/ratings)
-- on purpose: a visit is personal history that should outlive the plan that
-- produced it. Deleting the plan must not erase your log.
--
-- unique (person_id, plan_id) with the default NULLS DISTINCT is doing real
-- work: it makes "log the visit for this plan" idempotently upsertable,
-- while leaving standalone visits (plan_id null) unlimited.
--
-- group_label is the "a group as well" case: name the outing/crew
-- ("Friday crew") alongside, or instead of, individual companion tags.
create table if not exists visits (
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

-- The profile feed: someone's visits, newest first. Exactly this read path.
create index if not exists visits_person_idx on visits (person_id, visited_at desc);
-- "who's been here" on a spot card.
create index if not exists visits_spot_idx on visits (spot_id, visited_at desc);
-- "has this plan already been logged?" — only plan-derived rows matter.
create index if not exists visits_plan_idx on visits (plan_id) where plan_id is not null;

-- ── visit_companions ──────────────────────────────────────────────
-- Who you went with. EXACTLY ONE of the two identity paths per row:
--
--   person_id set, companion_name null → a tagged profile. Renders live
--     from people.display_name, so renames propagate, and it's clickable.
--   person_id null, companion_name set → a free-typed name. This is the
--     common case: most companions have no profile yet. It's also how the
--     app pre-fills companions from a plan's rsvps, which only carry
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
create table if not exists visit_companions (
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

create index if not exists visit_companions_visit_idx on visit_companions (visit_id);
-- "visits I was tagged in" — the other half of a profile page.
create index if not exists visit_companions_person_idx on visit_companions (person_id)
  where person_id is not null;

-- ── Row Level Security ────────────────────────────────────────────
-- Same documented v1 posture as the rest of the schema: RLS on, then grant
-- exactly what the loop needs to anon with using (true) / with check (true).
-- Not tightened, not loosened. Each grant states who can now do what.
--
-- ⚠ WHERE THIS REACHES FURTHER THAN "YOU HAVE THE LINK" — for `security`:
--
--  1. `people` insert/update are unrestricted. Anyone holding the anon key
--     (it is public by design) can create unlimited profiles, and can
--     RENAME / RE-EMOJI / RECOLOUR any existing person, including yours.
--     There is no secret tied to a person id, so this cannot be fixed
--     without inventing auth. The user accepted "impersonable by design";
--     profile *defacement by a stranger* is the sharper edge of that and
--     is worth an explicit callout in the UI or a v2 edge function.
--  2. `friendships` insert lets anyone friend any two people to each other
--     — and because friendship is symmetric, that forces a stranger into
--     YOUR friends list, not just theirs.
--  3. Deletes below are row-unrestricted: anyone with the anon key can
--     delete ANY friendship, visit, or companion tag, not only their own.
--     This is the same posture as the existing "clear votes" /
--     "clear plan_spots" policies, but visits are durable personal history
--     rather than in-flight plan state, so the blast radius is larger.
--  4. Reads are fully public: `visits` is enumerable in bulk, not just per
--     profile link. Anyone with the anon key can list every visit by every
--     person. The agreed model is "anyone with your profile link can see
--     your visits"; unfiltered select is strictly broader than that,
--     because the link stops being the thing you need. Flagging rather
--     than fixing, since per-row scoping needs a claim we don't have.
--
-- NOT granted (deliberately, and this is not a tightening — it was never
-- part of the loop): delete on `people`, update on visits/friendships/
-- visit_companions. Editing a visit = delete + re-log.

alter table people           enable row level security;
alter table friendships      enable row level security;
alter table visits           enable row level security;
alter table visit_companions enable row level security;

-- people: anyone can read any profile (public profile pages); anyone can
-- create a profile; anyone can update any profile (see callout 1).
drop policy if exists "read people"   on people;
drop policy if exists "create people" on people;
drop policy if exists "update people" on people;
create policy "read people"   on people for select using (true);
create policy "create people" on people for insert with check (true);
create policy "update people" on people for update using (true) with check (true);

-- friendships: anyone can read anyone's friends list; anyone can add or
-- remove a friendship edge (see callouts 2 and 3).
drop policy if exists "read friendships"   on friendships;
drop policy if exists "add friendships"    on friendships;
drop policy if exists "remove friendships" on friendships;
create policy "read friendships"   on friendships for select using (true);
create policy "add friendships"    on friendships for insert with check (true);
create policy "remove friendships" on friendships for delete using (true);

-- visits: anyone can read any visit; anyone can log one; anyone can delete
-- one (see callouts 3 and 4). Update intentionally not granted.
drop policy if exists "read visits"   on visits;
drop policy if exists "log visits"    on visits;
drop policy if exists "delete visits" on visits;
create policy "read visits"   on visits for select using (true);
create policy "log visits"    on visits for insert with check (true);
create policy "delete visits" on visits for delete using (true);

-- visit_companions: same shape — read any, tag any, untag any.
drop policy if exists "read companions"  on visit_companions;
drop policy if exists "tag companions"   on visit_companions;
drop policy if exists "untag companions" on visit_companions;
create policy "read companions"  on visit_companions for select using (true);
create policy "tag companions"   on visit_companions for insert with check (true);
create policy "untag companions" on visit_companions for delete using (true);

-- ── Realtime ──────────────────────────────────────────────────────
-- NOTHING from this migration joins supabase_realtime, on purpose.
-- Adding a table to the publication broadcasts its rows to every anon
-- subscriber, which is an access-control decision, not a perf one. The
-- vote screen needs live updates because several people are acting on one
-- shared screen at once; a profile feed, a friends list and a visit log are
-- all read-on-open and refetch fine. Revisit only if a genuinely live
-- shared surface (e.g. a friend activity feed) ships — and treat it as a
-- security decision then.
