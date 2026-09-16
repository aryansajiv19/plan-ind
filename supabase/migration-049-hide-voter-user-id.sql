-- Migration 049 — co-members can no longer read each other's auth uid.
-- Apply after migration 048. Re-run safe.
--
-- ⚠ DO NOT APPLY until the commit that replaces select("*") on votes, rsvps and
-- ratings with explicit column lists (app/plan/[id]/page.tsx) is DEPLOYED.
-- PostgREST's select=* fails with "permission denied for table" once any
-- column is withheld, so applying this first stops the plan page loading
-- votes: a total failure of the core screen from a migration that looks
-- unrelated to it.
--
-- The exposure (reproduced on a DB built from schema.sql, 2026-09-16): 043
-- added user_id to votes, rsvps and ratings, and "read accessible ..." is a
-- row-level policy, so any member of a plan could read every other member's
-- auth uid: a global identifier that the friendship exploit 048 closed used
-- as its starting point. participant_token_hash stays readable: it is random
-- per plan (lib/participant.ts), so it links nobody across plans, and the UI
-- matches your own rows by it.
--
-- Column grants, not a side table: the RPCs and RLS still use user_id as the
-- table owner, so no server path changes. Realtime honours this too; its
-- apply_rls filters every record and DELETE old-row column through
-- has_column_privilege (realtime v2.129.3, apply_rls.sql).
--
-- Ceiling: a column added to these tables later is SILENTLY invisible to
-- clients until a new migration grants it.

-- One transaction: a failing grant must also undo the revoke, however it is run.
begin;

revoke select on votes, rsvps, ratings from anon, authenticated;

grant select (id, plan_id, spot_id, voter_name, value, phase, pool_number,
  participant_token_hash, created_at) on votes to authenticated;
grant select (id, plan_id, voter_name, coming, choice, participant_token_hash,
  transport, seats_available, created_at) on rsvps to authenticated;
grant select (id, plan_id, spot_id, voter_name, stars, again,
  participant_token_hash, created_at) on ratings to authenticated;

commit;
