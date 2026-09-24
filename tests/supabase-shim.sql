-- Minimal Supabase-shaped shim (roles, auth.uid/jwt, storage, realtime, cron)
-- so schema.sql, migrations and `npm run test:db` run on bare Postgres when the
-- Supabase CLI/Docker is unavailable (e.g. cloud sessions). Local use only.
-- Usage: psql -d <db> -f tests/supabase-shim.sql && psql -d <db> -f supabase/schema.sql
do $$ begin
  create role anon nologin noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin noinherit bypassrls; exception when duplicate_object then null; end $$;
do $$ begin create role authenticator noinherit login password 'x'; exception when duplicate_object then null; end $$;
do $$ begin create role supabase_admin; exception when duplicate_object then null; end $$;
do $$ begin create role supabase_storage_admin; exception when duplicate_object then null; end $$;
do $$ begin create role supabase_realtime_admin; exception when duplicate_object then null; end $$;
do $$ begin create role postgres_owner; exception when duplicate_object then null; end $$;
grant anon, authenticated, service_role to authenticator;
create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists storage;
create schema if not exists realtime;
create schema if not exists cron;
grant usage on schema public, extensions, auth, storage, realtime to anon, authenticated, service_role;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(), aud text, role text, email text, phone text,
  raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}',
  is_anonymous boolean not null default false, created_at timestamptz default now(),
  updated_at timestamptz default now(), deleted_at timestamptz, email_confirmed_at timestamptz,
  last_sign_in_at timestamptz, is_sso_user boolean default false, banned_until timestamptz);
create or replace function auth.uid() returns uuid language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
create or replace function auth.role() returns text language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') $$;
create or replace function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
grant execute on all functions in schema auth to anon, authenticated, service_role;
create table if not exists storage.buckets (id text primary key, name text, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[], owner uuid, created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text, owner uuid, owner_id text, metadata jsonb, path_tokens text[] generated always as (string_to_array(name, '/')) stored,
  created_at timestamptz default now(), updated_at timestamptz default now(), last_accessed_at timestamptz default now(), version text);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'),1)-1] $$;
create table if not exists realtime.messages (id bigserial primary key, topic text, extension text, payload jsonb,
  event text, private boolean default true, inserted_at timestamptz default now(), updated_at timestamptz default now());
alter table realtime.messages enable row level security;
create or replace function realtime.topic() returns text language sql stable as
  $$ select nullif(current_setting('realtime.topic', true), '') $$;
create table if not exists cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text);
create or replace function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as
  $$ insert into cron.job(jobname, schedule, command) values (job_name, schedule, command)
     on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid $$;
create or replace function cron.unschedule(job_name text) returns boolean language sql as
  $$ delete from cron.job where jobname = job_name returning true $$;
do $$ begin create publication supabase_realtime; exception when duplicate_object then null; end $$;
