-- Migration 031 — schedule purge_security_operational_data() to actually run.
-- Apply after migration 030. Additive and re-run safe.
--
-- WHY: purge_security_operational_data() has existed since migration 020
-- ("Run daily through Supabase Cron" says its own comment) but nothing in the
-- repo or the live project ever scheduled it -- SECURITY_SETUP.md documents
-- it as a one-time manual dashboard step that was apparently never done.
-- pg_cron isn't installed on this project yet (confirmed: empty
-- pg_extension row for 'pg_cron'). security_events/app_rate_limits are
-- currently empty so there's no visible symptom -- but nothing will ever
-- purge once real traffic starts, and app_rate_limits in particular grows a
-- new row per (scope, subject, minute) for every quota check.
--
-- cron.schedule() with an existing job name updates it in place, so this is
-- safe to re-run. 02:17 local Supabase-project time, off the hour to avoid
-- contending with anything else that might run on the hour.

create extension if not exists pg_cron;

select cron.schedule(
  'purge-security-operational-data',
  '17 2 * * *',
  'select public.purge_security_operational_data()'
);
