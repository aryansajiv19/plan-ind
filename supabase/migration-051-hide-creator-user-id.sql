-- Migration 051 — clients can no longer read created_by_user_id on spots or plans.
-- Apply after migration 050. Re-run safe.
--
-- ⚠ DO NOT APPLY until BOTH are true:
--   1. migration 050 is applied (my_custom_spots, count_my_hosted_plans), and
--   2. T2's client commit is DEPLOYED: StartPlanForm.tsx and lib/social.ts call
--      those RPCs instead of .eq("created_by_user_id", ...), and
--      app/plan/[id]/page.tsx selects an explicit plans column list, not "*",
--      and lib/social.ts VISIT_SELECT embeds spots with a column list, not
--      spots(*).
-- Otherwise "my saved places", Wrapped, visit history on home and the plan
-- page itself fail with "permission denied for table".
--
-- The exposure (security review of 049): spots.created_by_user_id gave ANY
-- signed-in session, anonymous included, the uid of everyone who published a
-- community custom spot, next to its address. plans.created_by_user_id gave
-- every plan member the host's uid, also via the full-row Realtime UPDATE.
--
-- Column grants, as in 049. RLS policies that reference created_by_user_id
-- still evaluate (verified: a creator still reads their own private rows), and
-- Realtime strips the column per subscriber. INSERT/UPDATE grants are
-- untouched, so creating a custom spot still records its creator.
--
-- RULE, not just this fix: a uid column on a client-readable table is withheld
-- from client SELECT by default and granted only deliberately. Owner-only reads
-- go through a security-definer function filtered on auth.uid(), never a raw
-- .eq on the uid (a WHERE needs SELECT on the column), and never a PostgREST
-- computed field (a whole-row reference needs SELECT on every column).

revoke select on spots, plans from anon, authenticated;

grant select (id, name, category, minimum_age, area, cuisine, price_band,
  min_spend, open_till, vibe, photo_url, photo_source, photo_attribution,
  description, booking_url, source, visibility, address, latitude, longitude)
  on spots to anon, authenticated;

grant select (id, title, category, area, deadline, status, stage, pool_count,
  budget_per_person, origin_label, origin_latitude, origin_longitude, radius_km,
  smart_brief, vibe_preferences, avoid_preferences, intelligence_model,
  winner_spot_id, event_time, booking_owner, booked, created_at)
  on plans to authenticated;
