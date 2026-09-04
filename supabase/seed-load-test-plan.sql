-- Dedicated fixture for scripts/load/concurrency load-testing. A separate
-- plan id from the e2e fixture (22222222-…) on purpose: a load run fires many
-- writes at this plan, and the e2e suite's guest-vote spec shares its own
-- fixture across sessions/CI — the two must never collide.
--
-- Safe to re-run: deletes and recreates only this one plan id (cascades to
-- plan_spots/votes/rsvps/ratings/plan_host_tokens). created_by_user_id is
-- null — share-link-only, no host account needed, matching
-- seed-multi-round-plan.sql's pattern. Run in the Supabase SQL editor, or via
-- the Supabase MCP execute_sql against the live project (this is fixture
-- data, not schema — safe to run against live).

begin;

delete from plans where id = '33333333-3333-3333-3333-333333333333';

insert into plans (
  id, created_by_user_id, title, category, area, deadline,
  status, stage, pool_count, budget_per_person, origin_label
) values (
  '33333333-3333-3333-3333-333333333333',
  null,
  'Load test plan — do not decide',
  'dinner',
  'Dubai',
  now() + interval '30 days',  -- far out so the deadline auto-pick never
                                -- fires mid-run and advances the plan under a
                                -- concurrency test
  'open',
  'pool',
  1,        -- single round: every scenario contends on the same 3 spots
  250,
  'Downtown / DIFC'
);

-- Three curated places, one round. Concurrency scenarios pick spot #1 as the
-- shared contention target (vote-contend / vote-flap); the other two exist
-- so the tally read is meaningful, not a 1-candidate degenerate case.
with picked as (
  select id, row_number() over (order by category, name) as rn
  from (
    select id, category, name
    from spots
    where source = 'curated'
      and category in ('dinner', 'brunch', 'cafe')
    order by category, name
    limit 3
  ) s
)
insert into plan_spots (plan_id, spot_id, pool_number, advanced)
select '33333333-3333-3333-3333-333333333333', id, 1, false
from picked;

commit;

-- Check it landed: expect exactly 3 rows.
select pool_number, count(*) as places
from plan_spots
where plan_id = '33333333-3333-3333-3333-333333333333'
group by pool_number;
