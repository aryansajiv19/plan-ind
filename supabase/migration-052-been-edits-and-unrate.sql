-- Migration 052 — Been edits (C8): edit a visit, remove your rating, and a
-- safe display_name. Apply after 051 (or after 050 if 049/051 are still held;
-- nothing here depends on them). Re-run safe. STAGED, not applied.
--
-- Deleting a visit photo, a visit or a collection needs no SQL: the
-- owner-scoped delete policies already exist. Photo FILES must be removed
-- through the Storage API before their rows (deleting storage.objects rows in
-- SQL leaves the bytes behind). That ordering lives in the client contract.

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
