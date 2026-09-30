import assert from "node:assert/strict";
import test from "node:test";
import { intentFacts, intentToForm, nearestOption } from "@/lib/composer-intent";
import { validRemembered } from "@/lib/composer-settings";
import type { SmartIntent } from "@/components/SmartSearchBox";

const intent = (over: Partial<SmartIntent>): SmartIntent => ({
  category: "dinner", title: "Seafood by the water", summary: "", maxBudget: 180, origin: "marina",
  radiusKm: 12, vibeKeywords: [], avoidKeywords: [], occasion: null, ...over,
});

test("Luna's budget and radius snap to the form's chips, ties going up", () => {
  assert.equal(nearestOption([null, 100, 200, 350, 500], 150), 200);
  assert.equal(nearestOption([10, 20, 35, null], 12), 10);
  assert.equal(nearestOption([10, 20], null), null);
});

test("a usable intent sets the kind, group, origin and snapped limits", () => {
  const form = intentToForm(intent({}), 25, "Cafe");
  assert.deepEqual(form, { category: { key: "dinner", group: "food" }, origin: "marina", maxBudget: 200, radiusKm: 10, message: null });
  assert.equal(intentToForm(intent({ origin: "anywhere" }), 25, "Cafe").radiusKm, null, "anywhere has no radius");
});

test("an unlisted or age-gated kind keeps the current one, and says why", () => {
  const unlisted = intentToForm(intent({ category: "casino" }), 25, "Dinner");
  assert.equal(unlisted.category, null);
  assert.match(unlisted.message!, /isn’t listed here, so this stays Dinner\.$/);
  const young = intentToForm(intent({ category: "nightlife" }), 19, "Dinner");
  assert.equal(young.category, null);
  assert.match(young.message!, /is 21\+, so this stays Dinner\.$/);
});

test("remembered settings keep only what the form still offers this account", () => {
  assert.deepEqual(validRemembered({ category: "nightlife", maxBudget: 200, origin: "marina", radiusKm: null, presetIdx: 1 }, 25, 3),
    { category: validRemembered({ category: "nightlife" }, 25, 3).category, maxBudget: 200, origin: "marina", radiusKm: null, presetIdx: 1 });
  assert.deepEqual(validRemembered({ category: "nightlife", maxBudget: 175, origin: "mars", radiusKm: 99, presetIdx: 7 }, 19, 3), {});
  assert.deepEqual(validRemembered({}, 25, 3), {}, "absent is not null");
});

test("the described night reads back as the facts the form took", () => {
  assert.deepEqual(
    intentFacts({ category: "dinner", origin: "jumeirah", maxBudget: 250, vibeKeywords: ["relaxed", "quiet"] }),
    ["Dinner", "Jumeirah", "≤ AED 250", "relaxed"],
  );
  // An unlisted kind, "anywhere" and no budget leave no empty slots.
  assert.deepEqual(intentFacts({ category: "yachting", origin: "anywhere", maxBudget: null, vibeKeywords: [] }), []);
});
