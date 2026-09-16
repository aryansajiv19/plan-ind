-- Migration 047 — delete_plan: the host can delete an OPEN plan.
-- Apply after migration 045 (046 is reserved for the curated photo batch).
-- Additive (new function only), re-run safe.
--
-- A plan could never be removed at any layer, so a mis-created plan was
-- permanent for everyone in it (reversibility audit, R1, 2026-09-16).
--
-- Hard delete, not a 'cancelled' status. `status` stays exactly
-- 'open' | 'decided'. Every child table (plan_spots, votes, rsvps, ratings,
-- plan_host_tokens, plan_access) is already `on delete cascade` and visits is
-- `on delete set null`, so one delete leaves no orphans. `plans` is replica
-- identity full (045), so every subscribed client receives the DELETE live.
-- A tombstone status would be one more thing every plans reader filters, and
-- it would need a purge job later.
--
-- OPEN plans only. A decided plan holds other people's data (their ratings
-- would cascade away, their visits lose the plan link), so the host does not
-- get to erase it. Reopening a wrong decision is a separate command (R7).
--
-- Auth is execute_plan_command's (an authenticated session plus the host
-- token, compared against plan_host_tokens) PLUS the caller must be the plan's
-- creator. A leaked token (it lives in localStorage) can force a bad decide,
-- which is visible and fixable; it must not be able to erase a plan. Plans with
-- no recorded creator cannot be deleted. `for update` serialises the
-- delete against a concurrent `decide` on the same row.
--
-- Refusals are RETURNED, not raised, so a caller cannot mistake a no-op for
-- a delete: deleted | not_found | not_host | already_decided.
--
-- One audit row per successful delete, written in the same transaction, in
-- the existing security_events table (purged at 90 days by 031's job). It
-- answers "my plan vanished" support questions: who, which plan, when, and
-- how many people had taken part.

create or replace function delete_plan(p_plan_id uuid, p_host_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  target plans%rowtype;
  stored_hash text;
  participants int;
begin
  -- Same permanent-account gate as create_secure_plan: the route refuses
  -- anonymous sessions, and this holds for a direct PostgREST call too.
  if auth.uid() is null or coalesce(auth.jwt()->>'is_anonymous', 'false') = 'true' then
    raise exception 'Sign in required' using errcode = '42501';
  end if;

  select * into target from plans where id = p_plan_id for update;
  if target.id is null then
    return jsonb_build_object('result', 'not_found');
  end if;

  select token_hash into stored_hash from plan_host_tokens where plan_id = p_plan_id;
  if target.created_by_user_id is distinct from auth.uid()
     or p_host_token is null or length(p_host_token) < 32 or stored_hash is null
     or stored_hash <> encode(digest(p_host_token, 'sha256'), 'hex') then
    return jsonb_build_object('result', 'not_host');
  end if;

  if target.status <> 'open' then
    return jsonb_build_object('result', 'already_decided');
  end if;

  select count(distinct who) into participants from (
    select coalesce(user_id::text, participant_token_hash, voter_name) as who from votes where plan_id = p_plan_id
    union
    select coalesce(user_id::text, participant_token_hash, voter_name) from rsvps where plan_id = p_plan_id
  ) p;

  delete from plans where id = p_plan_id;

  insert into security_events (event_type, outcome, actor_user_id, metadata)
  values ('plan_command', 'success', auth.uid(),
    jsonb_build_object('command', 'delete', 'plan_id', p_plan_id, 'participants', participants));

  return jsonb_build_object('result', 'deleted', 'participants', participants);
end;
$$;

-- Named grants, not just public (the 021/024 trap). Signed-in sessions only.
revoke all on function delete_plan(uuid, text) from public, anon, authenticated;
grant execute on function delete_plan(uuid, text) to authenticated;
