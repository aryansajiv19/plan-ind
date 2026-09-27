import assert from "node:assert/strict";
import test from "node:test";
import { knownMinSpend, knownPriceBand, priceLabel } from "../lib/price.ts";

test("a curated place with a spend shows the spend", () => {
  const spot = { min_spend: 180, price_band: "$$" as const, source: "curated" as const };
  assert.equal(knownMinSpend(spot), 180);
  assert.equal(priceLabel(spot), "AED 180 pp");
});

test("no place is ever 'from AED 0'", () => {
  assert.equal(knownMinSpend({ min_spend: 0 }), null);
});

test("a free curated place keeps its real band", () => {
  const spot = { min_spend: 0, price_band: "$" as const, source: "curated" as const };
  assert.equal(knownPriceBand(spot), "$");
  assert.equal(priceLabel(spot), "$");
});

test("a custom place shows no price at all, not its forced '$$'", () => {
  const spot = { min_spend: 0, price_band: "$$" as const, source: "custom" as const };
  assert.equal(knownPriceBand(spot), null);
  assert.equal(priceLabel(spot), null);
});
