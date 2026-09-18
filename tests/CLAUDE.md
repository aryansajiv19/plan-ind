# tests/ — proving it, not describing it

**Read when:** writing or changing any test, or before claiming something is
verified.

## The three kinds here

| Kind | Command | Needs |
|---|---|---|
| Unit (`*.test.ts`) | `npm test` | nothing — no network, no env |
| DB integration (`*.dbtest.ts`) | `npm run test:db` | a running local Supabase |
| E2E (`e2e/*.spec.ts`) | `npm run test:e2e` | a running app |

Only the unit tier is in the merge gate. **Keep it that way for speed, but the
Realtime multi-client spec is the exception** — it guards a bug that has already
shipped twice, and it belongs where a merge can't skip it.

## A test that cannot fail is not a test

Every one of these happened here:

- **A spec that never reached its assertion.** Three specs looked for
  `"N people voting"` after that text was removed. They failed at setup for a
  day, and a real regression merged behind the green-looking silence. **Assert
  on something the app still renders, and prove the spec fails when the bug is
  present.**
- **A check that accepted any error.** A "Realtime refuses this filter" test
  passed while every subscription in the rig was broken. **Pair every refusal
  check with a positive control in the same run.**
- **A fuzz that ran one input 20,000 times** (an uncorrelated random subquery is
  evaluated once). **Assert the generator's distinct count.**
- **A shared fixture under `fullyParallel`.** Three specs voted on each other's
  rows. **One fixture per spec** — `e2e/fixture.ts`, `planIdFor(name)`.

## Round trips, not one-way trips

The suite tested forward paths almost exclusively. For anything a user can
undo, **do the action, undo it, and assert the world is actually back** — the
row is gone, the count reverted, the screen reflects it. A test that clicks
"delete" and checks the button was clickable proves nothing.

## Writing new tests

- Name what breaks if the logic breaks — not what the function does.
- Never assert on prose that varies run to run.
- If a number comes from a run, say **which environment produced it**. A
  local-stack figure is not a production figure; quoting one as the other has
  happened here more than once.
- Mark a run that could not complete as **INVALID or UNRUN**, never as a pass.
