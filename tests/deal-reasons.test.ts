import assert from "node:assert/strict";
import test from "node:test";
import { closesLate, dealReasons, spotDistanceKm, type DealReasonSpot } from "../lib/deal-reasons.ts";

function spot(overrides: Partial<DealReasonSpot> = {}): DealReasonSpot {
  return {
    id: "a",
    name: "Bait Maryam",
    cuisine: "Levantine",
    vibe: "Home style, like dinner at an aunt's",
    description: null,
    min_spend: 110,
    open_till: "11pm",
    source: "curated",
    ...overrides,
  };
}

const labels = (input: Parameters<typeof dealReasons>[0]) => dealReasons(input).map((r) => r.label);

test("no constraints and no history means no reasons, not filler", () => {
  assert.deepEqual(labels({ spot: spot() }), []);
});

test("budget reason names the plan's budget, and only when the spot fits it", () => {
  assert.deepEqual(labels({ spot: spot(), maxBudget: 150 }), ["Fits AED 150"]);
  assert.deepEqual(labels({ spot: spot({ min_spend: 200 }), maxBudget: 150 }), []);
  assert.deepEqual(labels({ spot: spot({ min_spend: 150 }), maxBudget: 150 }), ["Fits AED 150"]);
});

test("distance is a reason only when the plan set a radius the spot is inside", () => {
  assert.deepEqual(labels({ spot: spot(), distanceKm: 12.4 }), []);
  assert.deepEqual(labels({ spot: spot(), distanceKm: 12.4, radiusKm: 20 }), ["12 km away"]);
  assert.deepEqual(labels({ spot: spot(), distanceKm: 0.2, radiusKm: 20 }), ["1 km away"]);
  assert.deepEqual(labels({ spot: spot(), distanceKm: 30, radiusKm: 20 }), []);
});

test("a vibe keyword the deal ranked on is echoed back, case-insensitively", () => {
  assert.deepEqual(labels({ spot: spot(), vibeKeywords: ["terrace", "LEVANTINE"] }), ["Levantine, as asked"]);
  assert.deepEqual(labels({ spot: spot(), vibeKeywords: ["terrace"] }), []);
  // Over-long or trivial keywords never render.
  assert.deepEqual(labels({ spot: spot(), vibeKeywords: ["a", "x".repeat(40)] }), []);
});

test("new to you needs some history on this device", () => {
  assert.deepEqual(labels({ spot: spot(), been: [] }), []);
  assert.deepEqual(labels({ spot: spot(), been: ["b"] }), ["New to you"]);
  assert.deepEqual(labels({ spot: spot(), been: ["a"] }), []);
});

test("late closing is recognised from the catalog's open_till strings", () => {
  for (const late of ["1am", "2am", "1:30am", "3 am", "5AM"]) assert.equal(closesLate(late), true, late);
  for (const early of ["12am", "11pm", "11:30pm", "4pm", "3 hours", "Flexible", "6am"]) assert.equal(closesLate(early), false, early);
  assert.deepEqual(labels({ spot: spot({ open_till: "2am" }) }), ["Open late"]);
});

test("at most three reasons, most specific first", () => {
  const result = labels({
    spot: spot({ open_till: "3am" }),
    maxBudget: 200,
    radiusKm: 20,
    distanceKm: 8,
    vibeKeywords: ["levantine"],
    been: ["other"],
  });
  assert.deepEqual(result, ["Levantine, as asked", "Fits AED 200", "8 km away"]);
});

test("a pinned custom place claims no fit it never went through", () => {
  assert.deepEqual(
    labels({ spot: spot({ source: "custom", min_spend: 0 }), maxBudget: 100, radiusKm: 20, distanceKm: 3 }),
    ["Pinned by the host"],
  );
});

test("spotDistanceKm prefers coordinates, falls back to the area centre, else null", () => {
  const origin = { latitude: 25.2048, longitude: 55.2708 };
  assert.equal(spotDistanceKm(null, { area: "DIFC", latitude: null, longitude: null }), null);
  assert.equal(spotDistanceKm(origin, { area: "Nowhere Known", latitude: null, longitude: null }), null);
  assert.equal(spotDistanceKm(origin, { area: "Nowhere Known", latitude: 25.2048, longitude: 55.2708 }), 0);
  const byArea = spotDistanceKm(origin, { area: "Dubai Marina", latitude: null, longitude: null });
  assert.ok(byArea != null && byArea > 10 && byArea < 30);
});
