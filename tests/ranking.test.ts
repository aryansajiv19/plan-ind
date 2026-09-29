import assert from "node:assert/strict";
import test from "node:test";
import { answerComparison, insertionFor, insertionNeighbours, nextComparison, startInsertion } from "../lib/ranking.ts";

// A bucket best first; a hidden "true" rank decides every comparison.
const bucket = (n: number) => Array.from({ length: n }, (_, i) => ({ spotId: `s${i}`, truth: i }));

test("every slot of every size is found, with neighbours on both sides", () => {
  for (let n = 0; n <= 20; n += 1) {
    const list = bucket(n);
    for (let slot = 0; slot <= n; slot += 1) {
      const { after, before, steps } = insertionFor(list, (other) => slot <= other.truth);
      assert.equal(after, slot === 0 ? null : `s${slot - 1}`, `n=${n} slot=${slot}`);
      assert.equal(before, slot === n ? null : `s${slot}`, `n=${n} slot=${slot}`);
      assert.ok(steps <= Math.ceil(Math.log2(n + 1)), `n=${n} slot=${slot} took ${steps} taps`);
    }
  }
});

test("an empty bucket asks nothing: the place is the whole bucket", () => {
  const state = startInsertion([]);
  assert.equal(nextComparison([], state), null);
  assert.deepEqual(insertionNeighbours([], state), { after: null, before: null });
});

test("the stepper shows the middle and narrows on each tap", () => {
  const list = bucket(5);
  let state = startInsertion(list);
  assert.equal(nextComparison(list, state)?.spotId, "s2");
  state = answerComparison(state, true); // better than s2
  assert.equal(nextComparison(list, state)?.spotId, "s1");
  state = answerComparison(state, false); // worse than s1
  assert.equal(nextComparison(list, state), null);
  assert.deepEqual(insertionNeighbours(list, state), { after: "s1", before: "s2" });
});
