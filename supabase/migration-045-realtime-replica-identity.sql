-- Migration 045: REPLICA IDENTITY FULL on every table in the Realtime
-- publication.
--
-- ── What is actually broken ──────────────────────────────────────────────
--
-- INSERTs propagate fine under the default replica identity. **DELETEs do
-- not.** A DELETE's WAL record carries only the replica identity of the old
-- row, so under `default` that is the primary key alone -- not enough for
-- Realtime to evaluate the subscription's `plan_id=eq.<id>` filter or the
-- row's RLS policy, so the event is dropped. Silently: the subscriber is
-- still SUBSCRIBED and simply never hears.
--
-- In this product a DELETE is not an edge case. `cast_plan_vote` with
-- `p_value := false` DELETES the row -- that is how a participant clears a
-- pick or changes their mind mid-round. So:
--
--   someone un-votes, and everyone else's screen keeps showing the old
--   count and the old selection until they reload.
--
-- During a live group vote the tally other people are looking at is simply
-- wrong, which is the one number this app exists to get right.
--
-- ── Measured, two browser contexts on one plan ───────────────────────────
--
--   votes = default   A votes -> B sees 1 ✓   A un-votes -> B still 1 ✗
--   votes = full      A votes -> B sees 1 ✓   A un-votes -> B sees 0 ✓
--
-- One `alter table` between the two runs, nothing else. Live has the same
-- `default(pk)` on all five published tables (catalog query, 2026-09-07), so
-- this is a production defect, not a local-environment artefact.
--
-- ── A correction worth keeping ───────────────────────────────────────────
--
-- My first diagnosis was that Realtime delivered NOTHING under `default`,
-- based on a standalone probe that received zero events. The probe was
-- wrong, not the app -- it called `realtime.setAuth()` before joining, and
-- the real client does not. The app receives INSERTs perfectly well. Had I
-- shipped that reasoning, this migration would have been justified by a
-- claim that a two-minute test disproves. The narrower finding is the true
-- one, and it is still worth fixing.
--
-- ── The cost, stated ─────────────────────────────────────────────────────
--
-- FULL makes an UPDATE or DELETE write the whole old row to the WAL instead
-- of just the key. A vote is a handful of small columns and a plan holds a
-- handful of rows, so this is negligible here. It would deserve rethinking
-- only if one of these became a high-churn table with wide rows.
--
-- Applies to exactly the tables already in `supabase_realtime`. Adds nothing
-- to the publication, changes no policy, widens no access.

alter table public.votes      replica identity full;
alter table public.plans      replica identity full;
alter table public.rsvps      replica identity full;
alter table public.ratings    replica identity full;
alter table public.plan_spots replica identity full;
