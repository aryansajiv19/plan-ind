-- Migration 052 — Been edits (C8): edit a visit, remove your rating, and a
-- safe display_name. Apply after 051 (or after 050 if 049/051 are still held;
-- nothing here depends on them). Re-run safe. STAGED, not applied.
--
-- Deleting a visit photo, a visit or a collection needs no SQL: the
-- owner-scoped delete policies already exist. Photo FILES must be removed
-- through the Storage API before their rows (deleting storage.objects rows in
-- SQL leaves the bytes behind). That ordering lives in the client contract.

-- ── 1. display_name gets the same control/bidi guard as emoji ─────────────
-- Names now reach strangers through preview_friend_invite, so an RTL-override
-- run could make an invite look like it came from someone else. Same ranges
-- as people_emoji_safe (migration 006). The constraint scans existing rows:
-- run the runbook's pre-apply count first (it must be 0).
alter table people drop constraint if exists people_display_name_safe;
alter table people add constraint people_display_name_safe
  check (
    display_name !~ '[[:cntrl:]]'
    and display_name !~ ('[' || chr(8206) || chr(8207)
                             || chr(8234) || '-' || chr(8238)
                             || chr(8294) || '-' || chr(8297) || ']')
  );

-- Every write path now sanitises the same way: ensure_authenticated_profile
-- already runs names through clean_app_text, which strips exactly the
-- characters the check above rejects. Doing the same here makes a direct
-- rename behave like sign-up (strip, not 23514), instead of a new error path
-- a settings screen would have to handle (security review of 052, L1).
-- Otherwise identical to the current definition (migration 007 / schema.sql),
-- plus a pinned search_path (Supabase advisor function_search_path_mutable;
-- every name below is already schema-qualified or pg_catalog).
create or replace function people_before_write() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.display_name := public.clean_app_text(new.display_name, 40);
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
