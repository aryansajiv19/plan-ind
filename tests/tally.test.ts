import assert from "node:assert/strict";
import test from "node:test";
import {
  agreementOf,
  isInRound,
  leaderOf,
  roundFor,
  visibleSpotsFor,
  votersFor,
  yesCount,
} from "../lib/tally.ts";
import type { PlanSpot, Vote } from "../lib/types.ts";

let n = 0;
function vote(spot_id: string, voter_name: string, overrides: Partial<Vote> = {}): Vote {
  return { id: `v${++n}`, plan_id: "p", spot_id, voter_name, value: true, phase: "final", pool_number: 0, ...overrides };
}
const link = (spot_id: string, pool_number: number, advanced = false): PlanSpot => ({ plan_id: "p", spot_id, pool_number, advanced });

test("roundFor: a pool stage reads the active pool; final and decided both read final/0", () => {
  assert.deepEqual(roundFor("pool", 2), { phase: "pool", poolNumber: 2 });
  assert.deepEqual(roundFor("final", 2), { phase: "final", poolNumber: 0 });
  assert.deepEqual(roundFor("decided", 3), { phase: "final", poolNumber: 0 });
});

test("a pool-2 vote does not leak into the pool-1 or final tally", () => {
  const votes = [vote("a", "Sara", { phase: "pool", pool_number: 2 }), vote("a", "Omar", { phase: "pool", pool_number: 1 })];
  assert.equal(yesCount(votes, "a", roundFor("pool", 1)), 1);
  assert.equal(yesCount(votes, "a", roundFor("pool", 2)), 1);
  assert.equal(yesCount(votes, "a", roundFor("final", 0)), 0);
});

test("legacy rows with no phase/pool_number count as the final round", () => {
  const legacy = { ...vote("a", "Sara"), phase: undefined, pool_number: undefined } as unknown as Vote;
  assert.equal(isInRound(legacy, roundFor("final", 0)), true);
  assert.equal(isInRound(legacy, roundFor("pool", 1)), false);
});

test("a cleared (value=false) vote is not a yes and not a face on the card", () => {
  const votes = [vote("a", "Sara"), vote("a", "Omar", { value: false })];
  const round = roundFor("final", 0);
  assert.equal(yesCount(votes, "a", round), 1);
  assert.deepEqual(votersFor(votes, "a", round), ["Sara"]);
});

test("votersFor is sorted, so arrival order never reshuffles faces", () => {
  const round = roundFor("final", 0);
  const one = votersFor([vote("a", "Zed"), vote("a", "Amal"), vote("a", "Maya")], "a", round);
  const two = votersFor([vote("a", "Maya"), vote("a", "Zed"), vote("a", "Amal")], "a", round);
  assert.deepEqual(one, ["Amal", "Maya", "Zed"]);
  assert.deepEqual(two, one);
});

test("visibleSpotsFor: pool shows its own three; final shows advanced, else everything", () => {
  const spots = ["a", "b", "c", "d"].map((id) => ({ id }));
  const links = [link("a", 1), link("b", 1), link("c", 2, true), link("d", 2, true)];
  assert.deepEqual(visibleSpotsFor(spots, links, "pool", 1).map((s) => s.id), ["a", "b"]);
  assert.deepEqual(visibleSpotsFor(spots, links, "final", 1).map((s) => s.id), ["c", "d"]);
  assert.deepEqual(visibleSpotsFor(spots, [link("a", 1)], "decided", 1).map((s) => s.id), ["a", "b", "c", "d"]);
});

test("leaderOf: a clear leader wins; a tie or zero votes has no leader", () => {
  const counts: Record<string, number> = { a: 3, b: 1, c: 0 };
  assert.equal(leaderOf(["a", "b", "c"], (id) => counts[id]), "a");
  assert.equal(leaderOf(["a", "b"], () => 2), null);
  assert.equal(leaderOf(["a", "b"], () => 0), null);
  assert.equal(leaderOf([], () => 0), null);
});

test("agreementOf: even split is 0, unanimity is 1, no votes or one option is 0", () => {
  assert.equal(agreementOf([2, 2, 2]), 0);
  assert.equal(agreementOf([4, 0, 0]), 1);
  assert.equal(agreementOf([0, 0, 0]), 0);
  assert.equal(agreementOf([5]), 0);
  assert.ok(Math.abs(agreementOf([2, 1, 1]) - 0.25) < 1e-9);
});
