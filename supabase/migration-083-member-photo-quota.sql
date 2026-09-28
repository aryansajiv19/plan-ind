-- Migration 083: roomier Google photo quota for signed-in members.
--
-- STAGED -- written, not applied anywhere. Apply only with the owner's
-- approval, then record it in worklog.md the same day.
--
-- consume_app_quota's 'place-photo' bucket: 20/minute and 60/day per account
-- became 40/minute and 150/day. The arithmetic (item 15): Google photos come
-- only from the 42 curated spots with a place id and no photo of their own,
-- and the browser keeps each answer an hour. A member scrolling Discover to
-- the end, making one plan and coming back later is ~42 + 9 + ~20 = ~70 a day,
-- over 60; a fast Discover scroll asks for more than 20 in a minute. The
-- global 300/day (the spend ceiling, <= $56/month at $7 per 1,000 Place
-- Photos after the free 1,000) and the visitor limits (077) are unchanged,
-- and still bind everyone. Body: 063's, verbatim, but for those two numbers.

begin;

create or replace function consume_app_quota(p_secret text, p_scope text)
returns boolean language plpgsql security definer set search_path = public, extensions, pg_temp as $$
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
    when 'plan-command' then 20 when 'place-photo' then 40 else 20 end;
  day_limit := case p_scope
    when 'smart-search' then 30 when 'plan-create' then 50 when 'spot-deal' then 300
    when 'plan-command' then 100 when 'place-photo' then 150 else 200 end;
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
  -- a global daily ceiling bounds the bill, not just the per-user cap.
  if p_scope = 'place-photo' then
    insert into app_rate_limits values('place-photo-global','global',day_start,1)
      on conflict(scope,subject,window_start) do update set request_count=app_rate_limits.request_count+1
      returning request_count into current_count;
    return current_count <= 300;
  end if;
  return true;
end; $$;
-- 021: signed-in sessions only. Quota is keyed on uid::text and the body
-- raises when auth.uid() is null, so anon could never spend quota anyway.
revoke all on function consume_app_quota(text,text) from public, anon, authenticated;
grant execute on function consume_app_quota(text,text) to authenticated;

commit;
