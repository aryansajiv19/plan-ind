-- Migration 029 — capture rls_auto_enable() + the ensure_rls event trigger
-- into version control. Apply after 028. Additive, re-run safe.
--
-- This function and event trigger are already live (created outside any
-- migration file — pre-dates this repo's migration numbering, per T0's SEC.4
-- audit). Migration 024 found it anon/authenticated-executable by name (same
-- root-cause revoke as everything else 024 fixed) and revoked it defensively;
-- this migration adds nothing new to prod, it only brings the file tree in
-- line with what is already running, so a scratch schema.sql rebuild carries
-- the same safety net and it stops showing up as drift in every future audit.
--
-- What it does, for context: an event trigger that fires after any `CREATE
-- TABLE` (or `CREATE TABLE AS` / `SELECT INTO`) in the `public` schema and
-- force-enables row level security on the new table. A safety net for a
-- table created by hand (SQL editor, ad-hoc migration) that forgets the
-- explicit `alter table ... enable row level security` this file already
-- does for every table it creates — it does not change what schema.sql
-- itself does (every table below still gets its own explicit enable), it
-- only matters for tables created *after* a fresh load, the way it already
-- has been on the live project.
--
-- Definition captured verbatim via pg_get_functiondef('public.rls_auto_enable'::regproc)
-- and the pg_event_trigger catalog row for evtname='ensure_rls' (both supplied
-- by T0 from the live project). Not modified.

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

-- 024 already covers this (revoke from public, anon, authenticated — an
-- event trigger function is never client-callable as an RPC anyway, this is
-- tidiness/documentation, not a live grant change).
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

-- CREATE EVENT TRIGGER has no IF NOT EXISTS / OR REPLACE — guard manually,
-- same pattern migration 022 uses for `alter publication ... add table`.
do $$
begin
  if not exists (select 1 from pg_event_trigger where evtname = 'ensure_rls') then
    create event trigger ensure_rls on ddl_command_end
      when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      execute function public.rls_auto_enable();
  end if;
end $$;

-- ── Verification (run after applying) ────────────────────────────────────
-- select evtname, evtenabled, evtfoid::regproc from pg_event_trigger where evtname = 'ensure_rls';
-- -- expect one row, evtenabled = 'O' (enabled), evtfoid = rls_auto_enable
