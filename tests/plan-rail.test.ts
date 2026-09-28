import assert from "node:assert/strict";
import test from "node:test";
import { seatKeyFor, voteNeeded, type RailVote } from "../lib/plan-rail.ts";

const pick = (phase: string, pool: number | null, value = true): RailVote => ({ plan_id: "p", phase, pool_number: pool, value });

test("pools: needed until a yes in every pool; a no doesn't count", () => {
  const open = { status: "open" as const, stage: "pool" as const };
  assert.equal(voteNeeded(open, 3, []), true);
  assert.equal(voteNeeded(open, 3, [pick("pool", 1), pick("pool", 2)]), true);
  assert.equal(voteNeeded(open, 3, [pick("pool", 1), pick("pool", 2), pick("pool", 3, false)]), true);
  assert.equal(voteNeeded(open, 3, [pick("pool", 1), pick("pool", 2), pick("pool", 3)]), false);
});

test("final: needed until a yes in the final; pool picks don't count; decided never needs one", () => {
  const final = { status: "open" as const, stage: "final" as const };
  assert.equal(voteNeeded(final, 3, [pick("pool", 1), pick("pool", 2), pick("pool", 3)]), true);
  assert.equal(voteNeeded(final, 3, [pick("final", null)]), false);
  assert.equal(voteNeeded({ status: "decided", stage: "decided" }, 3, []), false);
});

test("seat key is md5(plan:user), matching the database's generated column (psql md5 of the same pair)", () => {
  assert.equal(seatKeyFor("11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"), "8365b91fbfe4f8c375f0d522d0f5a8b5");
});
