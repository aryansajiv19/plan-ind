-- Migration 024 — SEC.4: revoke anon EXECUTE, by name, from the functions the
-- migration-020-era `revoke ... from public` lines missed, plus close one age
-- guard the security review of this migration surfaced.
--
-- Root cause (same one migration 021 fixed): Supabase's default privileges
-- grant EXECUTE to `anon` and `authenticated` BY NAME at function-creation
-- time, and `revoke ... from public` does not cancel a named grant. So each of
-- these is still callable with just the publishable key and no session.
--
-- Applied live by T0 via the Supabase MCP (this project has no migration
-- ledger). apply_migration wraps the file in its own transaction, so there is
-- no explicit begin/commit here — matching 021/022/023. Verify with the
-- trailing SELECT. Re-run safe: REVOKE of an absent privilege is a no-op and
-- the loops skip a function that does not exist.

-- ── Client-facing RPCs — keep `authenticated`, drop `anon` ───────────────
-- set_birth_date(date)                        — app/auth/actions.ts
-- current_member_age()                        — lib/age-policy.ts
-- ensure_authenticated_profile(text,text,text) — app/home, app/plan/[id],
--                                               app/api/place-import
-- current_member_age and ensure_authenticated_profile both hard-gate on
-- is_permanent_user() and no-op for an anonymous session. set_birth_date does
-- NOT (see the body fix below), so revoking anon here is load-bearing, not
-- just tidy.
do $$
declare fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('set_birth_date', 'current_member_age', 'ensure_authenticated_profile')
  loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;

-- ── Internal helpers + trigger functions — no client role needs EXECUTE ──
-- ensure_default_place_collections(uuid) — called only from the people-insert
--   trigger and the 012 backfill; a client could currently call it with any
--   profile_id and seed collection rows.
-- mirror_friendship()                   — AFTER trigger on friendships.
-- people_default_place_collections()    — AFTER trigger on people.
-- rls_auto_enable                       — trigger/event-trigger; not present
--   in any migration or schema.sql (live-only drift — flagged to T0). The
--   loop revokes it if it exists and skips it if it does not.
-- Trigger EXECUTE is checked at CREATE TRIGGER time, not at fire time
-- (CVE-2012-0866), and all four are SECURITY DEFINER owned by postgres, so
-- revoking from every client role does not stop them firing.
do $$
declare fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('ensure_default_place_collections', 'mirror_friendship',
                        'people_default_place_collections', 'rls_auto_enable')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;
end $$;

-- ── Close the set_birth_date anonymous-session gap ───────────────────────
-- set_birth_date only checks `auth.uid() is not null`. Its siblings
-- current_member_age / ensure_authenticated_profile also require
-- is_permanent_user(). A Supabase anon→permanent upgrade keeps the same uid,
-- so an anonymous session could write a fabricated write-once DOB via
-- PostgREST and inherit it on conversion, side-stepping the 18/21 venue
-- gates. Zero exploitability today (anon sign-ins disabled — B1 — and no
-- anon-upgrade flow), but the revoke above is the only thing standing in
-- front of it, so make the body match the intent too. Body otherwise
-- unchanged from 019.
create or replace function set_birth_date(p_date_of_birth date)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  years integer;
begin
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
-- create or replace preserves the ACL, but this create is reached only after
-- the loop above already set it; restate so a drop+create keeps intent.
revoke all on function set_birth_date(date) from public, anon;
grant execute on function set_birth_date(date) to authenticated;

-- ── Verification (run after applying) ────────────────────────────────────
-- Expect anon = false for every row; authenticated = false for the four
-- internal functions, true for the three RPCs. A missing rls_auto_enable row
-- just means it is not in this database.
select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as function,
       has_function_privilege('anon', p.oid, 'execute')          as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('set_birth_date', 'current_member_age', 'ensure_authenticated_profile',
                    'ensure_default_place_collections', 'mirror_friendship',
                    'people_default_place_collections', 'rls_auto_enable')
order by 1;

-- Age gate: an anonymous session must no longer be able to set a birth date.
-- select set_birth_date('1990-01-01');  -- as an anon JWT → expect 42501 'Sign in first'
