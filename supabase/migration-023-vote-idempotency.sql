-- Migration 023 — make cast_plan_vote explicitly idempotent per
-- (plan, participant, round). Apply after 022. Additive and re-run safe.
--
-- Why a separate file and not folded into 021 or 022: 021 is a privileges-only
-- migration that advertises "no table, column, policy or function is created,
-- altered or dropped" — this alters a function and swaps an index. 022 is
-- BE.2's quota/realtime change. This is one coherent concern: the vote write
-- contract. All three are unapplied and the owner applies them in order.
--
-- What this changes, and why:
--
-- cast_plan_vote already converges to the same state on a retry — it deletes
-- the participant's row for the round before inserting one. But it `returns
-- void`, so a client cannot confirm what the server now holds, and the
-- delete-then-insert is not atomic against a concurrent second call by the
-- same participant: both can delete (matching zero rows), then both insert,
-- leaving the participant with two YES rows in one round. `execute_plan_command`
-- tallies `count(*) where value` per spot, so that participant's single choice
-- is then counted twice and can decide a plan.
--
-- Fix: a partial unique index on (plan_id, participant_token_hash, phase,
-- pool_number) makes "one choice per participant per round" a database
-- invariant, and lets the insert use ON CONFLICT ... DO UPDATE instead of
-- delete-then-insert. A concurrent second call now blocks on the first's row
-- lock and then updates that one row. The function also returns the resulting
-- selection as jsonb — identical on every retry.

-- ── 1. Collapse any pre-existing duplicates ──────────────────────────────
-- Keep the most recent row per (plan, participant, round); (created_at, id)
-- breaks a same-timestamp tie deterministically. Only tokenised rows are
-- touched — legacy name-only rows (participant_token_hash null) are not a
-- claim and are left exactly as they are.
delete from votes v
using votes keep
where v.participant_token_hash is not null
  and keep.participant_token_hash = v.participant_token_hash
  and keep.plan_id     = v.plan_id
  and keep.phase       = v.phase
  and keep.pool_number = v.pool_number
  and (keep.created_at, keep.id) > (v.created_at, v.id);

-- ── 2. Enforce one choice per participant per round ──────────────────────
-- The new key's prefix (plan_id, participant_token_hash) subsumes every
-- lookup votes_participant_token_idx served, so that index is redundant.
drop index if exists votes_participant_token_idx;

create unique index if not exists votes_participant_round_key
  on votes (plan_id, participant_token_hash, phase, pool_number)
  where participant_token_hash is not null;

-- ── 3. cast_plan_vote: explicit idempotency + a payload on retry ─────────
-- Signature is byte-identical to 019/020 (PostgREST resolves by parameter-name
-- set, so the return-type change is transparent to the existing caller, which
-- only checks `error`). Validation block is unchanged from 019.
create or replace function cast_plan_vote(
  p_plan_id uuid, p_spot_id uuid, p_voter_name text, p_value boolean,
  p_phase text, p_pool_number smallint, p_participant_token_hash text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target plans%rowtype;
  clean_name text := left(trim(p_voter_name), 40);
begin
  if p_participant_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Participant authorization required' using errcode = '42501';
  end if;
  if clean_name = '' then
    raise exception 'Enter a name before voting' using errcode = '22023';
  end if;
  if p_phase not in ('pool', 'final') then
    raise exception 'Unsupported voting phase' using errcode = '22023';
  end if;

  select * into target from plans where id = p_plan_id;
  if target.id is null or target.status <> 'open' then
    raise exception 'This plan is not open for voting' using errcode = '22023';
  end if;
  -- The stage gates the phase: pool votes close once the finalists are set.
  if p_phase <> target.stage then
    raise exception 'This round is no longer open' using errcode = '22023';
  end if;
  if p_phase = 'pool' and (p_pool_number < 1 or p_pool_number > target.pool_count) then
    raise exception 'That round does not exist' using errcode = '22023';
  end if;
  if p_phase = 'final' and p_pool_number <> 0 then
    raise exception 'That round does not exist' using errcode = '22023';
  end if;
  -- The spot must be a candidate on this plan, in this pool. In the final
  -- round it must additionally be one of the advanced finalists.
  if not exists (
    select 1 from plan_spots ps
    where ps.plan_id = p_plan_id and ps.spot_id = p_spot_id
      and (p_phase = 'final' or ps.pool_number = p_pool_number)
      and (p_phase = 'pool' or ps.advanced)
  ) then
    raise exception 'That place is not on this plan' using errcode = '22023';
  end if;

  if p_value then
    -- Upsert the single row for this (plan, participant, round). A concurrent
    -- call by the same participant serialises on votes_participant_round_key
    -- and lands here as the DO UPDATE branch — never a second row.
    insert into votes (plan_id, spot_id, voter_name, value, phase, pool_number, participant_token_hash)
    values (p_plan_id, p_spot_id, clean_name, true, p_phase, p_pool_number, p_participant_token_hash)
    on conflict (plan_id, participant_token_hash, phase, pool_number)
      where participant_token_hash is not null
      do update set spot_id = excluded.spot_id, voter_name = excluded.voter_name, value = true;
  else
    -- Clearing a choice.
    delete from votes
      where plan_id = p_plan_id and participant_token_hash = p_participant_token_hash
        and phase = p_phase and pool_number = p_pool_number;
  end if;

  -- Deterministic, and byte-identical when the same call is replayed.
  return jsonb_build_object(
    'plan_id',     p_plan_id,
    'phase',       p_phase,
    'pool_number', p_pool_number,
    'spot_id',     case when p_value then p_spot_id else null end
  );
end; $$;

-- `create or replace function` preserves the ACL: 019 revoked from public and
-- granted anon+authenticated; 020 revoked execute from anon. Restated here so a
-- future drop+create (which resets the ACL and re-grants anon by name) has the
-- intended posture spelled out — participant writes require a session.
revoke all on function cast_plan_vote(uuid, uuid, text, boolean, text, smallint, text) from public, anon;
grant execute on function cast_plan_vote(uuid, uuid, text, boolean, text, smallint, text) to authenticated;

-- ── Verification (run after applying) ────────────────────────────────────
--
-- 1. The invariant exists:
--
--    select indexdef from pg_indexes where indexname = 'votes_participant_round_key';
--    -- expect: CREATE UNIQUE INDEX ... (plan_id, participant_token_hash, phase, pool_number)
--    --         WHERE (participant_token_hash IS NOT NULL)
--
-- 2. Idempotency, against a live plan + a real participant token hash
--    (needs a session — role authenticated — and a claimed plan_access row):
--
--    select cast_plan_vote(:plan, :spot_a, 'Probe', true, 'pool', 1::smallint, :hash);
--    select cast_plan_vote(:plan, :spot_a, 'Probe', true, 'pool', 1::smallint, :hash);
--    -- both return the same jsonb; then:
--    select count(*) from votes
--      where plan_id = :plan and participant_token_hash = :hash
--        and phase = 'pool' and pool_number = 1;
--    -- expect: 1
--
-- 3. Switching the choice keeps it at one row:
--
--    select cast_plan_vote(:plan, :spot_b, 'Probe', true, 'pool', 1::smallint, :hash);
--    -- count stays 1, row now points at :spot_b
--
-- The concurrent-double-vote case (two spots, same participant, same round,
-- fired in parallel) is covered by the qa-test suite, not a manual probe.
