-- Migration 082: whole-app security audit follow-ups (no Medium or above).
--
-- STAGED -- written, not applied anywhere. Apply only with the owner's
-- approval, then record it in worklog.md the same day.
--
-- 1. A custom spot already in a plan keeps what the group voted on. 065
--    refuses DELETE of such a spot; an owner could still rename it or move
--    its pin under everyone's feet. A BEFORE UPDATE trigger now refuses
--    changes to name, area, category, minimum_age, latitude or longitude
--    while it is in any plan (the same plan predicate as 065), with 42501
--    and a hint. Visibility stays editable: going private is the way out.
--    And authenticated may now UPDATE only what the UI edits (name, area,
--    visibility; components/CustomPlaces.tsx). Checked: no other client path
--    updates spots (the load-test seeder writes with the local service role;
--    definer functions run as their owner). RLS "update own custom spots"
--    still decides which rows.
--
-- 2. Zero-policy tables still carried anon table privileges (and three of
--    them authenticated ones no client path uses). RLS already
--    refused anon every row; the grants go too, so a policy added by
--    mistake can't expose them. Checked: every function touching these is
--    security definer (runs as owner) except plan_host_authorized, which no
--    client role may execute (revoked in 067) and only definers call.

begin;

create or replace function public.protect_spots_in_plans_on_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.source = 'custom'
     and (new.name, new.area, new.category, new.minimum_age, new.latitude, new.longitude)
         is distinct from (old.name, old.area, old.category, old.minimum_age, old.latitude, old.longitude)
     and (exists (select 1 from plan_spots x where x.spot_id = old.id)
          or exists (select 1 from votes x where x.spot_id = old.id)
          or exists (select 1 from ratings x where x.spot_id = old.id)
          or exists (select 1 from plans x where x.winner_spot_id = old.id)) then
    raise exception 'This place is part of a plan, so its details can''t change.'
      using errcode = '42501',
            hint = 'It''s in a plan; make it private instead.';
  end if;
  return new;
end;
$$;
-- A trigger function; no client role needs EXECUTE (the 021/024 trap).
revoke all on function public.protect_spots_in_plans_on_update() from public, anon, authenticated;

drop trigger if exists spots_protect_in_plans_on_update on spots;
create trigger spots_protect_in_plans_on_update
  before update of name, area, category, minimum_age, latitude, longitude on spots
  for each row execute function public.protect_spots_in_plans_on_update();

revoke update on spots from anon, authenticated;
grant update (name, area, visibility) on spots to authenticated;

revoke all on table member_ages, app_rate_limits, security_events, friend_invites, plan_host_tokens from anon;
-- Security review of 082 (Low): the same for authenticated where no client
-- path needs any. These have zero policies (020 dropped "attach host token"
-- and "read own age"), so only definer functions, running as owner, touch
-- them. member_ages and friend_invites keep authenticated's grants for now:
-- RLS still refuses every row, and readMemberAge's legacy fallback reads it.
revoke all on table app_rate_limits, security_events, plan_host_tokens from authenticated;
-- Supabase's default grants also give both client roles TRUNCATE (which
-- RLS does not govern), REFERENCES and TRIGGER on every public table. None
-- is reachable through PostgREST; none is needed. Gone on these five.
revoke truncate, references, trigger on table member_ages, app_rate_limits, security_events, friend_invites, plan_host_tokens from anon, authenticated;

commit;
