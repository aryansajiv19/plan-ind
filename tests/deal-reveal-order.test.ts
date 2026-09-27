import assert from "node:assert/strict";
import test from "node:test";
import { inRevealOrder } from "../lib/deal.ts";

test("the reveal shows each round as create_secure_plan fills it (place i in round i mod 3)", () => {
  const dealt = ["p0", "p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"];
  assert.deepEqual(inRevealOrder(dealt), ["p0", "p3", "p6", "p1", "p4", "p7", "p2", "p5", "p8"]);
});
