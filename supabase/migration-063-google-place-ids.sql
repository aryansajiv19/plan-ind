-- Migration 063: Google place ids on curated spots + the place-photo quota.
--
-- STAGED -- not applied anywhere. Additive and re-run safe. Apply only with
-- the owner's approval, then verify by catalog probe (below) and record it in
-- worklog.md the same day. The data (which spot is which place) lands
-- separately, in the migration scripts/places-backfill.ts --write-sql
-- generates from a human-reviewed file.
--
-- ── What is stored, and why only this (Maps Platform terms) ──────────────
-- The Service Specific Terms (Places API §14.3) allow caching ONLY lat/lng,
-- for at most 30 consecutive days; the general terms (3.2.3) forbid caching
-- or storing any other Google Maps Content, and specifically "business
-- names, addresses, or user reviews". The place ID is exempt and may be
-- stored indefinitely (docs/PLACES_INGESTION_SCOPE.md §3). So:
--
--   google_place_id   stored. Google recommends refreshing ids older than
--                     12 months; an id-only Place Details call is free.
--   places_synced_at  when this row's id was last confirmed against Google
--                     (our own fact, not Google content). Drives that
--                     12-month refresh.
--
-- Deliberately NOT columns: rating, user_rating_count, opening hours,
-- google_maps_uri, website_uri, Google's coordinates, photo names. Each is
-- Google content we may not keep; photo names additionally expire. A Maps
-- link needs no stored URI -- it is built from the id
-- (lib/places/maps-url.ts). Existing latitude/longitude stay ours (OSM/hand,
-- migrations 037/042) and are never overwritten from Google, which would
-- start a 30-day deletion clock on them.
--
-- ── Who can do what ───────────────────────────────────────────────────────
-- anon/authenticated: may READ google_place_id and places_synced_at (a public
--   identifier, needed for Maps links and by the photo route, which reads
--   through the caller's own session). Column grant below, same pattern as 051.
-- Nobody can WRITE them from a client: curated rows have no client update
--   policy, and custom spots are refused a place id by CHECK, so a user
--   cannot squat a place id and block the curated backfill on the unique
--   index.

alter table public.spots
  add column if not exists google_place_id text,
  add column if not exists places_synced_at timestamptz;

alter table public.spots drop constraint if exists spots_google_place_id_format;
alter table public.spots add constraint spots_google_place_id_format
  check (google_place_id is null or google_place_id ~ '^[A-Za-z0-9_-]{10,255}$');

alter table public.spots drop constraint if exists spots_google_place_id_curated_only;
alter table public.spots add constraint spots_google_place_id_curated_only
  check (google_place_id is null or source = 'curated');

-- One spot per place. Partial, so the many nulls never collide.
create unique index if not exists spots_google_place_id_key
  on public.spots (google_place_id) where google_place_id is not null;

grant select (google_place_id, places_synced_at) on public.spots to anon, authenticated;

-- ── place-photo quota ─────────────────────────────────────────────────────
-- Every /api/spots/{id}/photo call is a billable Place Photo request
-- ($7/1,000 after 1,000 free per month). Per user: 60/minute, 600/day. And a
-- GLOBAL 300/day ceiling (~9,000/month, worst case ~$56/month) because
-- anonymous guests can mint fresh identities -- a per-user cap alone does
-- not bound the bill. `create or replace` keeps the ACL; the revoke/grant is
-- re-stated anyway so this file is correct on its own.
create or replace function consume_app_quota(p_secret text, p_scope text)
returns boolean language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare uid uuid := auth.uid(); minute_start timestamptz := date_trunc('minute',now()); day_start timestamptz := date_trunc('day',now()); current_count integer; minute_limit integer; day_limit integer;
begin
  if not valid_control_secret(p_secret) or uid is null
     or p_scope not in ('smart-search','plan-create','place-import','spot-deal','plan-command','place-photo') then
    raise exception 'Server authorization required' using errcode='42501';
  end if;
  minute_limit := case p_scope
    when 'smart-search' then 10 when 'plan-create' then 12 when 'spot-deal' then 30
    when 'plan-command' then 20 when 'place-photo' then 60 else 20 end;
  day_limit := case p_scope
    when 'smart-search' then 30 when 'plan-create' then 50 when 'spot-deal' then 300
    when 'plan-command' then 100 when 'place-photo' then 600 else 200 end;
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
  if p_scope = 'place-photo' then
    insert into app_rate_limits values('place-photo-global','global',day_start,1)
      on conflict(scope,subject,window_start) do update set request_count=app_rate_limits.request_count+1
      returning request_count into current_count;
    return current_count <= 300;
  end if;
  return true;
end; $$;
revoke all on function consume_app_quota(text,text) from public, anon, authenticated;
grant execute on function consume_app_quota(text,text) to authenticated;

-- Verify after applying (catalog probe, not assumption):
--   select column_name from information_schema.columns
--     where table_schema='public' and table_name='spots'
--       and column_name in ('google_place_id','places_synced_at');       -- 2 rows
--   select indexname from pg_indexes where indexname='spots_google_place_id_key';  -- 1 row
--   select prosrc like '%place-photo-global%' from pg_proc where proname='consume_app_quota';  -- t
