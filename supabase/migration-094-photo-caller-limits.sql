-- Migration 094: per-caller Google photo limits that fit a photo wall.
--
-- With Google photos on every page (091/092), one visitor scrolling
-- Discover's 120-tile wall asks for 80+ photos inside a minute and hit the
-- 40/minute limit, so tiles fell back to art. Per-caller limits rise to
-- 120/minute and 400/day (members and signed-out visitors alike); the site
-- ceiling (092: 1,500/day) still bounds the bill. Only the numbers change.

begin;

create or replace function public.consume_app_quota(p_secret text, p_scope text)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare uid uuid := auth.uid(); minute_start timestamptz := date_trunc('minute',now()); day_start timestamptz := date_trunc('day',now()); current_count integer; minute_limit integer; day_limit integer;
begin
  if not valid_control_secret(p_secret) or uid is null
     or p_scope not in ('smart-search','plan-create','place-import','spot-deal','plan-command','place-photo') then
    raise exception 'Server authorization required' using errcode='42501';
  end if;
  -- 022: 'spot-deal' gets its own bucket. Dealing happens before a plan
  -- exists and is re-rolled repeatedly, so sharing plan-create's bucket
  -- would lock a user out of creating the plan they were dealing for.
  -- 030: 'plan-command' gets its own bucket too -- was the only app/api/**
  -- route with zero rate limiting.
  minute_limit := case p_scope
    when 'smart-search' then 10 when 'plan-create' then 12 when 'spot-deal' then 30
    when 'plan-command' then 20 when 'place-photo' then 120 else 20 end;
  day_limit := case p_scope
    when 'smart-search' then 30 when 'plan-create' then 50 when 'spot-deal' then 300
    when 'plan-command' then 100 when 'place-photo' then 400 else 200 end;
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
  -- 063: every place-photo call is billable; guests can mint identities, so
  -- a global daily ceiling bounds the bill, not just the per-user cap. 092: 1,500.
  if p_scope = 'place-photo' then
    insert into app_rate_limits values('place-photo-global','global',day_start,1)
      on conflict(scope,subject,window_start) do update set request_count=app_rate_limits.request_count+1
      returning request_count into current_count;
    return current_count <= 1500;
  end if;
  return true;
end; $function$;

create or replace function public.consume_otp_limit(p_secret text, p_scope text, p_subject text)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  minute_start timestamptz := date_trunc('minute', now());
  day_start timestamptz := date_trunc('day', now());
  current_count integer;
  minute_limit integer;
  day_limit integer;
  subject_key text := left(p_subject, 128);
begin
  if not valid_control_secret(p_secret) or p_scope not in ('otp-request', 'otp-verify', 'deal-preview', 'place-photo-anon')
     or subject_key is null or subject_key = '' then
    raise exception 'Server authorization required' using errcode = '42501';
  end if;
  -- otp-request: 3/minute, 10/day. otp-verify: 8/minute, 20/day.
  -- 072: deal-preview, 30/minute, 300/day per hashed client IP.
  -- 077/094: place-photo-anon, 120/minute, 400/day per hashed client IP.
  minute_limit := case p_scope when 'otp-request' then 3 when 'deal-preview' then 30
    when 'place-photo-anon' then 120 else 8 end;
  day_limit := case p_scope when 'otp-request' then 10 when 'deal-preview' then 300
    when 'place-photo-anon' then 400 else 20 end;
  insert into app_rate_limits values(p_scope||'-minute', subject_key, minute_start, 1)
    on conflict(scope,subject,window_start) do update set request_count = app_rate_limits.request_count+1
    returning request_count into current_count;
  if current_count > minute_limit then return false; end if;
  insert into app_rate_limits values(p_scope||'-day', subject_key, day_start, 1)
    on conflict(scope,subject,window_start) do update set request_count = app_rate_limits.request_count+1
    returning request_count into current_count;
  if current_count > day_limit then return false; end if;
  -- 077/092: every photo draws on the one global daily counter (cap 1,500).
  -- Visitors may take it to 1,200 only, so the last 300 stay for members. A
  -- refused visitor must not count (the update's WHERE).
  if p_scope = 'place-photo-anon' then
    current_count := null;
    insert into app_rate_limits values('place-photo-global', 'global', day_start, 1)
      on conflict(scope,subject,window_start) do update set request_count = app_rate_limits.request_count+1
        where app_rate_limits.request_count < 1200
      returning request_count into current_count;
    return current_count is not null;
  end if;
  return true;
end; $function$;

commit;
