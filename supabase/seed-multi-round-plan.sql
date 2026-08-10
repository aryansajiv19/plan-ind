-- Seed one three-round plan for testing the pool flow.
--
-- WHY THIS EXISTS: the only other seeded plan
-- (11111111-1111-1111-1111-111111111111) is a legacy single-round plan, so
-- rounds, round dots, the swipe carousel and pool advancement cannot be
-- exercised locally at all.
--
-- Safe to re-run: it deletes and recreates only this one plan id. It touches
-- nothing else. Run it in the Supabase SQL editor.
--
-- Note: no single curated category has nine spots (dinner, the largest, has
-- five), which is why lib/deal.ts deals from related category families. This
-- seed does the same — nine places drawn from the food-and-drink family.

begin;

-- Cascades to plan_spots, votes, rsvps, ratings and plan_host_tokens.
delete from plans where id = '22222222-2222-2222-2222-222222222222';

insert into plans (
  id, created_by_user_id, title, category, area, deadline,
  status, stage, pool_count, budget_per_person, origin_label
) values (
  '22222222-2222-2222-2222-222222222222',
  null,                       -- no owner: the share link is the only access
  'Test plan — three rounds',
  'dinner',
  'Dubai',
  now() + interval '7 days',  -- far out, so the deadline auto-pick never fires
                              -- mid-test and decide the plan out from under you
  'open',
  'pool',
  3,
  250,
  'Downtown / DIFC'
);

-- Nine curated places, three per round. row_number is taken over a stable
-- ordering so re-running gives the same nine in the same rounds.
with picked as (
  select id, row_number() over (order by category, name) as rn
  from (
    select id, category, name
    from spots
    where source = 'curated'
      and category in ('dinner', 'brunch', 'cafe', 'dessert')
    order by category, name
    limit 9
  ) s
)
insert into plan_spots (plan_id, spot_id, pool_number, advanced)
select '22222222-2222-2222-2222-222222222222', id, ((rn - 1) % 3) + 1, false
from picked;

-- Host token, so the host controls (advance, decide, edit event) can be
-- tested. execute_plan_command compares against this hash; the plaintext
-- token goes in the browser (see the README block at the bottom).
insert into plan_host_tokens (plan_id, token_hash)
values (
  '22222222-2222-2222-2222-222222222222',
  '4ffa690ab63a3dfec372edc8349287378d99582fec5ee5999083fe6dacf35007'
);

-- Two other people have already voted in round 1, so the tally is not all
-- zeroes and the difference between "your pick" (live accent) and "the
-- winner" (champagne) is visible. Delete this block for a clean slate.
with round_one as (
  select spot_id, row_number() over (order by spot_id) as slot
  from plan_spots
  where plan_id = '22222222-2222-2222-2222-222222222222'
    and pool_number = 1
),
voters (voter_name, token_hash, picks_slot) as (
  values ('Sara', repeat('a', 64), 1),
         ('Zain', repeat('b', 64), 1),   -- Sara and Zain agree, so slot 1 leads
         ('Maya', repeat('c', 64), 2)
)
insert into votes (plan_id, spot_id, voter_name, value, phase, pool_number, participant_token_hash)
select '22222222-2222-2222-2222-222222222222', r.spot_id, v.voter_name, true, 'pool', 1, v.token_hash
from voters v
join round_one r on r.slot = v.picks_slot;

commit;

-- Check it landed: expect 3 rounds x 3 places, and 3 votes in round 1.
select pool_number, count(*) as places
from plan_spots
where plan_id = '22222222-2222-2222-2222-222222222222'
group by pool_number
order by pool_number;

-- ─────────────────────────────────────────────────────────────────
-- HOW TO TEST
--
-- 1. Open  /plan/22222222-2222-2222-2222-222222222222
--    Type any name at the gate. You vote as a participant.
--
-- 2. To act as the HOST (advance rounds, decide the winner, edit the
--    event), run this once in the browser console on that page:
--
--    localStorage.setItem(
--      'plan-host:22222222-2222-2222-2222-222222222222',
--      '8605f487d673a93e7ebd6b05a40ca111d6d197cc47e86bb4dba08be4448e6cd8'
--    );
--
--    then reload. Without it you are a normal participant and the
--    advance/decide controls will tell you only the host can use them.
--
-- 3. To test as a SECOND person, open the same link in a private window —
--    participant identity is per-browser, so you get a separate vote.
--
-- 4. To reset and start over, just run this file again.
-- ─────────────────────────────────────────────────────────────────
