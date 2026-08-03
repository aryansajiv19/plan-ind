-- ─────────────────────────────────────────────────────────────────
-- Migration 006 — hardening the social layer after the `security` audit.
--
-- ADDITIVE AND SAFE TO RE-RUN. Drops nothing but its own triggers and
-- constraints, which it immediately recreates. It creates no tables, adds
-- no policies, and adds nothing to supabase_realtime. It touches only
-- `people`, `visits` and `visit_companions` (all introduced by 005).
--
-- RUN ORDER: 005 first, then this file. If 005 has already been run,
-- running this file alone is correct and sufficient.
--
-- ⚠ ONE BEHAVIOURAL TIGHTENING, stated plainly (audit item M2): anon can no
-- longer write `people.auth_user_id` or re-key `people.id`. Nothing in the
-- app ever wrote either, so no shipping code changes. Every other grant in
-- this project is unchanged — nothing here is loosened, and no new policy
-- is created.
--
-- What this file does NOT fix, on purpose:
--   * H1 (visits are bulk-enumerable; a profile link is not a real
--     capability). That is with the user as a product decision.
--   * H2(b) (the `visits` upsert conflict path being denied by RLS). Fixed
--     in lib/social.ts by delete-then-insert, NOT by granting UPDATE on
--     `visits` — see the note at the bottom of this file before you
--     "helpfully" add that policy.
-- ─────────────────────────────────────────────────────────────────

-- ══ M1 — bound and normalise `people` ══════════════════════════════
--
-- `emoji` was bare `text` under an anon-writable `update people using (true)`
-- policy, so anyone could PATCH any person's emoji to a megabyte of text, a
-- paragraph, or a bidi-override run — and it renders in the avatar slot on
-- every card that person appears on.
--
-- Bound: 1–8 characters. Measured against real emoji sequences so this does
-- not reject legitimate avatars:
--   🙂 = 1, 🇦🇪 (flag) = 2, 👍🏽 (skin tone) = 2, 1️⃣ (keycap) = 3,
--   👨‍👩‍👧‍👦 (ZWJ family) = 7.
alter table people drop constraint if exists people_emoji_len;
alter table people add constraint people_emoji_len
  check (char_length(emoji) between 1 and 8);

-- Reject C0/C1 controls and the bidi overrides/isolates, which can reorder
-- or hide surrounding text wherever the avatar renders.
--
-- The bidi class is built with chr() rather than written literally so this
-- file stays pure ASCII and cannot be mangled by an editor, a diff or a
-- copy-paste. The code points excluded are:
--   8206 U+200E LRM,  8207 U+200F RLM
--   8234 U+202A .. 8238 U+202E  (LRE RLE PDF LRO RLO)
--   8294 U+2066 .. 8297 U+2069  (LRI RLI FSI PDI)
-- Deliberately NOT excluded, because they are how compound emoji are built:
--   8205 U+200D ZWJ, 65039 U+FE0F VS16, 8419 U+20E3 combining keycap.
-- chr() is immutable, so it is legal in a CHECK. Verified on PostgreSQL 16:
-- ZWJ family / keycap / skin tone / flag all pass; an RTL-override run and a
-- tab both fail. (A NUL byte is rejected by the text type itself, earlier.)
alter table people drop constraint if exists people_emoji_safe;
alter table people add constraint people_emoji_safe
  check (
    emoji !~ '[[:cntrl:]]'
    and emoji !~ ('[' || chr(8206) || chr(8207)
                      || chr(8234) || '-' || chr(8238)
                      || chr(8294) || '-' || chr(8297) || ']')
  );

-- The pre-existing check is char_length(trim(display_name)) between 1 and 40,
-- but the STORED value was never trimmed — "Bob" plus a thousand spaces
-- passed. The trigger below trims on write; this constraint is the belt to
-- that braces, so the bound still holds on the raw stored value even if the
-- trigger is ever dropped.
alter table people drop constraint if exists people_display_name_len;
alter table people add constraint people_display_name_len
  check (char_length(display_name) between 1 and 40);

-- ══ M2 — make `people.id` and `people.auth_user_id` unwritable by anon ══
--
-- `auth_user_id` is the documented v2 auth-upgrade seam and it is `unique`.
-- RLS is row-level, not column-level, so `update people using (true)` left
-- it writable today via PostgREST: an attacker could squat arbitrary uuids
-- in it, or set it on somebody else's row. Inert in v1; at v2 it either
-- blocks the real user's backfill with a unique violation or binds a
-- profile to the wrong identity.
--
-- WHY A TRIGGER AND NOT `revoke update (auth_user_id) on people from anon`,
-- which is what the audit proposed. Measured on PostgreSQL 16, not reasoned
-- about:
--   1. Revoking a COLUMN privilege against a TABLE-level grant is a SILENT
--      NO-OP. `revoke update (auth_user_id) on people from anon` returns
--      REVOKE, and the squatting UPDATE immediately afterwards still
--      reports "UPDATE 1". Supabase grants anon table-level UPDATE, so the
--      proposed one-liner would have looked applied and changed nothing.
--   2. Doing it properly (revoke the table UPDATE, then grant a column
--      list) does block the squat — but it also breaks
--      `INSERT ... ON CONFLICT (id) DO UPDATE SET id = excluded.id, ...`
--      with "permission denied for table people". That is a shape PostgREST
--      may emit for upsertMe(), so it risks trading a dormant v2 bug for a
--      live v1 outage.
--   3. Neither revoke form covers INSERT at all. `POST /people` carrying a
--      chosen `auth_user_id` would still burn the unique index and pre-empt
--      a future real user. The trigger covers insert and update.
--
-- Scope: clamps only when the effective role is anon/authenticated, i.e. a
-- PostgREST request. A migration or backfill run as the table owner is
-- untouched, so v2 auth adoption still works as designed.
--
-- NOT security definer. It runs with the caller's privileges, grants
-- nothing, and only ever copies OLD values forward or writes NULL.
create or replace function people_before_write() returns trigger
language plpgsql as $$
begin
  -- Normalise first (M1). CHECK constraints are evaluated after BEFORE
  -- triggers, so the bounds above apply to the value actually stored.
  new.display_name := trim(new.display_name);
  new.emoji        := trim(new.emoji);
  new.color        := lower(trim(new.color));

  -- Identity columns are not part of the client-writable surface.
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.auth_user_id := null;
    else
      new.id           := old.id;
      new.auth_user_id := old.auth_user_id;
    end if;
  end if;

  return new;
end $$;

drop trigger if exists people_before_write on people;
create trigger people_before_write
  before insert or update on people
  for each row execute function people_before_write();

-- ══ M5 — normalise companion names server-side ═════════════════════
--
-- `unique (visit_id, companion_name)` is exact-string. normaliseCompanions()
-- in lib/social.ts trims and lowercases for dedupe, but that is client-side
-- only: a direct PostgREST call could store "Sara", "sara" and "Sara " as
-- three companions on one visit.
--
-- Fixed in two halves: trim on write (below) and a case-insensitive unique
-- index. Display casing is preserved — only the uniqueness key is folded.
-- The original exact-string unique constraint is left in place: it is now
-- strictly implied by the functional index, and dropping it would be a
-- destructive change for no gain.
create or replace function trim_companion_name() returns trigger
language plpgsql as $$
begin
  new.companion_name := nullif(trim(new.companion_name), '');
  return new;
end $$;

drop trigger if exists visit_companions_before_write on visit_companions;
create trigger visit_companions_before_write
  before insert or update on visit_companions
  for each row execute function trim_companion_name();

-- Same stored-value-never-trimmed gap on visits.group_label / visits.note.
-- Whitespace-only input now becomes NULL instead of violating the CHECK and
-- failing the whole write, which also matches what lib/social.ts sends.
create or replace function trim_visit_text() returns trigger
language plpgsql as $$
begin
  new.group_label := nullif(trim(new.group_label), '');
  new.note        := nullif(trim(new.note), '');
  return new;
end $$;

drop trigger if exists visits_before_write on visits;
create trigger visits_before_write
  before insert or update on visits
  for each row execute function trim_visit_text();

-- NULLS DISTINCT (the index default) is load bearing here exactly as it is
-- on the constraint this shadows: rows with companion_name null are tagged
-- profiles and must never collide with each other.
create unique index if not exists visit_companions_name_ci_idx
  on visit_companions (visit_id, lower(companion_name));

-- ══ H2(b) — a note for whoever reads this next ═════════════════════
--
-- `visits` deliberately has NO update policy, and this migration does not
-- add one. That is not an oversight.
--
-- Reproduced on PostgreSQL 16: PostgreSQL applies UPDATE policies to the
-- ON CONFLICT DO UPDATE path, so with no UPDATE policy the conflict path
-- fails with
--   ERROR: new row violates row-level security policy (USING expression)
--          for table "visits"
-- which is why logVisit()'s `.upsert(..., { onConflict: "person_id,plan_id" })`
-- returned null instead of merging, and left a stale companion set behind.
--
-- The fix is in lib/social.ts: delete-then-insert. Granting
-- `update on visits using (true)` would have fixed the upsert AND let any
-- holder of the (public) anon key silently rewrite the contents of anyone's
-- visit log in place. Deletion is already possible and is at least visible;
-- silent content forgery on durable personal history is not. Do not add
-- that policy without taking it back to `security` and the user.
