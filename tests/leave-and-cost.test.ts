import assert from "node:assert/strict";
import test from "node:test";
import { leaveBy } from "../lib/directions.ts";
import { groupCostLine, spendPerHead } from "../lib/price.ts";

test("leave by: event less travel and 10 min spare, rounded down to 5, never in the past", () => {
  const now = new Date("2026-10-02T12:00:00Z");
  // 16:00Z less 32 + 10 min = 15:18Z, rounded down to 15:15Z.
  assert.equal(leaveBy("2026-10-02T16:00:00.000Z", 32, now)?.toISOString(), "2026-10-02T15:15:00.000Z");
  assert.equal(leaveBy("2026-10-02T12:20:00.000Z", 30, now), null, "already time to have left");
  assert.equal(leaveBy(null, 30, now), null);
  assert.equal(leaveBy("2026-10-02T16:00:00.000Z", null, now), null);
});

test("spend per head reads 070's facts, else the minimum spend, else nothing", () => {
  assert.deepEqual(spendPerHead({ spend_pp_aed: "99-199", min_spend: 0 }), { low: 99, high: 199, kind: "range" });
  assert.deepEqual(spendPerHead({ spend_pp_aed: "500+", min_spend: 0 }), { low: 500, high: null, kind: "plus" });
  assert.deepEqual(spendPerHead({ spend_pp_aed: null, min_spend: 150 }), { low: 150, high: null, kind: "minimum" });
  assert.equal(spendPerHead({ spend_pp_aed: "ask", min_spend: 0 }), null, "no invented number");
});

test("the group line multiplies by who's coming, and stays per-head for one", () => {
  assert.equal(groupCostLine({ spend_pp_aed: "99-199", min_spend: 0 }, 5), "About AED 99–199 each · AED 495–995 for the 5 coming");
  assert.equal(groupCostLine({ spend_pp_aed: "365", min_spend: 0 }, 4), "About AED 365 each · AED 1,460 for the 4 coming");
  assert.equal(groupCostLine({ spend_pp_aed: "500+", min_spend: 0 }, 3), "AED 500+ each · AED 1,500+ for the 3 coming");
  assert.equal(groupCostLine({ spend_pp_aed: null, min_spend: 150 }, 2), "Minimum spend AED 150 each · at least AED 300 for the 2 coming");
  assert.equal(groupCostLine({ spend_pp_aed: "0", min_spend: 0 }, 6), "Free to get in");
  assert.equal(groupCostLine({ spend_pp_aed: "99-199", min_spend: 0 }, 1), "About AED 99–199 each");
  assert.equal(groupCostLine({ spend_pp_aed: null, min_spend: 0 }, 5), null);
});
