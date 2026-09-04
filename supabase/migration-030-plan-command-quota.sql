-- Migration 030 — rate limit on execute_plan_command.
-- Apply after migration 029. Additive and re-run safe.
--
-- DEPLOYMENT ORDER MATTERS, same as 022: app/api/plans/[id]/command/route.ts
-- calls consumeQuota with the new 'plan-command' scope in the same commit.
-- Until this migration is applied the pre-030 function raises 'Server
-- authorization required' for that scope, consumeQuota() returns false, and
-- the route answers 429 to every host command. Apply this before deploying.
--
-- WHY: of the five app/api/** routes, execute_plan_command was the only one
-- with no rate limit of any kind. Auth requires a session (not necessarily a
-- permanent one) and the RPC's own `for update` row lock on `plans` serializes
-- concurrent commands per plan, but that's a correctness lock, not a volume
-- cap -- a signed-in caller with a valid host token (or a leaked one) could
-- hammer the route unbounded. 20/minute, 100/day is generous for legitimate
-- use (a plan sees advance/decide/patch a handful of times in its life) and
-- caps abuse. Own bucket, not shared with plan-create/spot-deal, for the same
-- reason those two don't share: unrelated actions shouldn't lock each other
-- out.

create or replace function consume_app_quota(p_secret text, p_scope text)
returns boolean language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare uid uuid := auth.uid(); minute_start timestamptz := date_trunc('minute',now()); day_start timestamptz := date_trunc('day',now()); current_count integer; minute_limit integer; day_limit integer;
begin
  if not valid_control_secret(p_secret) or uid is null
     or p_scope not in ('smart-search','plan-create','place-import','spot-deal','plan-command') then
    raise exception 'Server authorization required' using errcode='42501';
  end if;
  minute_limit := case p_scope
    when 'smart-search' then 10
    when 'plan-create' then 12
    when 'spot-deal' then 30
    when 'plan-command' then 20
    else 20 end;
  day_limit := case p_scope
    when 'smart-search' then 30
    when 'plan-create' then 50
    when 'spot-deal' then 300
    when 'plan-command' then 100
    else 200 end;
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
  return true;
end; $$;

-- Same repeated mistake this directory keeps having to re-fix: `create or
-- replace function` preserves the ACL, so restate the revoke/grant explicitly
-- rather than assume `create or replace` alone is enough.
revoke all on function consume_app_quota(text,text) from public, anon, authenticated;
grant execute on function consume_app_quota(text,text) to authenticated;
