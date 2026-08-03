-- ─────────────────────────────────────────────────────────────────
-- Migration 004 — mid-plan "shake it up".
-- To swap a plan's options we must clear the old dealt spots and their
-- votes, so anon needs DELETE on plan_spots + votes. Additive & re-run safe.
-- (Same permissive v1 posture as the other policies.)
-- ─────────────────────────────────────────────────────────────────

drop policy if exists "clear plan_spots" on plan_spots;
drop policy if exists "clear votes"      on votes;

create policy "clear plan_spots" on plan_spots for delete using (true);
create policy "clear votes"      on votes      for delete using (true);
