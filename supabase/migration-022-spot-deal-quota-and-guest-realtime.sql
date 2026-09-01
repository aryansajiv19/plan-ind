-- Migration 022 — spot-deal quota scope + the guest share-link realtime gap.
-- Apply after migration 021. Additive and re-run safe.
--
-- DEPLOYMENT ORDER MATTERS. `app/api/spots/deal/route.ts` calls
-- consume_app_quota with the new 'spot-deal' scope in the same commit. Until
-- this migration is applied the pre-022 function raises 'Server authorization
-- required' for that scope, consumeQuota() returns false, and the route answers
-- 429 to everyone. Apply this before deploying, not after.

-- ── 1. 'spot-deal' quota scope ────────────────────────────────────
--
-- Dealing is a re-rollable read: people hit it repeatedly before a plan
-- exists. It deliberately does NOT share the 'plan-create' bucket — spending
-- plan-create on re-deals would lock a user out of creating the plan they
-- were dealing for. Own bucket, own limits: 30/minute, 300/day.
--
-- Note the pre-existing `else` arms in the limit CASE expressions: adding a
-- scope name to the whitelist without adding it to both CASEs silently hands
-- it place-import's limits. Both are spelled out here.

create or replace function consume_app_quota(p_secret text, p_scope text)
returns boolean language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare uid uuid := auth.uid(); minute_start timestamptz := date_trunc('minute',now()); day_start timestamptz := date_trunc('day',now()); current_count integer; minute_limit integer; day_limit integer;
begin
  if not valid_control_secret(p_secret) or uid is null
     or p_scope not in ('smart-search','plan-create','place-import','spot-deal') then
    raise exception 'Server authorization required' using errcode='42501';
  end if;
  minute_limit := case p_scope
    when 'smart-search' then 10
    when 'plan-create' then 12
    when 'spot-deal' then 30
    else 20 end;
  day_limit := case p_scope
    when 'smart-search' then 30
    when 'plan-create' then 50
    when 'spot-deal' then 300
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

-- `create or replace function` does NOT reset privileges, and Supabase's
-- default privileges granted EXECUTE to anon and authenticated by name at
-- creation time. `revoke ... from public` alone would leave the anon grant
-- standing — that is exactly how valid_control_secret became a live oracle.
-- Revoke from every named client role first, then grant back explicitly.
-- After this: only `authenticated` may execute consume_app_quota; `anon`
-- cannot. Idempotent, and independent of whether 021 has been applied.
revoke all on function consume_app_quota(text,text) from public, anon, authenticated;
grant execute on function consume_app_quota(text,text) to authenticated;

-- ── 2. plan_spots joins the realtime publication ──────────────────
--
-- The share-link vote screen subscribes to postgres_changes on plan_spots
-- (`advanced` flips when the host advances a round), but plan_spots was never
-- added to supabase_realtime. The host patches its own copy from the command
-- response, so only guests are affected: when the host advances to the final
-- round every guest keeps rendering the full pool until they reload.
--
-- ACCESS-CONTROL NOTE, not a performance one. Adding a table to
-- supabase_realtime broadcasts its rows. postgres_changes applies the table's
-- RLS per subscriber, and plan_spots' only select policy is
-- "read accessible plan spots" — membership in plan_access. So this exposes
-- plan_spots rows to exactly the set that can already SELECT them: users who
-- have redeemed that plan's share uuid. No new reader, no new column.
-- plan_spots holds no secret: plan_id, spot_id, pool_number, advanced.
--
-- Replica identity is deliberately left at default (primary key). That means
-- DELETE events carry only the key and are dropped for RLS'd subscribers —
-- acceptable, because the screen only cares about UPDATE (`advanced`), and
-- `replica identity full` would start shipping whole old rows.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'plan_spots'
  ) then
    alter publication supabase_realtime add table plan_spots;
  end if;
end $$;

-- ── Deliberately NOT in this migration ────────────────────────────
--
-- pgvector groundwork. `create extension vector` plus an embedding column on
-- spots is not risk-free here: an `embedding vector(1536)` column on `spots`
-- would be returned by every existing `select("*")` on spots — including the
-- share-link vote screen's own spot load — adding ~6 KB per row to the exact
-- path this migration is trying to unblock. It needs narrowed select lists
-- shipped first, so it gets its own migration.
