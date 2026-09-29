import { test } from "node:test";
import assert from "node:assert/strict";
import { planPersonality, UNLOCK_AT, type PersonalityVisit } from "@/lib/personality";

// 21:00 Dubai is 17:00 UTC; 09:00 Dubai is 05:00 UTC.
const at = (dubaiHour: number, day = 1) => new Date(Date.UTC(2026, 6, day, dubaiHour - 4)).toISOString();
const visit = (over: Partial<PersonalityVisit>): PersonalityVisit => ({
  visitedAt: at(21), spotId: crypto.randomUUID(), category: "dinner", cuisine: null, area: null, crewSize: 3, fromPlan: false, ...over,
});

test("locked until enough visits, and says how many are left", () => {
  const r = planPersonality([visit({}), visit({})]);
  assert.deepEqual(r, { unlocked: false, visits: 2, needed: UNLOCK_AT - 2 });
});

test("late nights, many cuisines and group votes read as the traits they are", () => {
  const cuisines = ["japanese", "lebanese", "indian", "italian"];
  const r = planPersonality(cuisines.map((c, i) => visit({ cuisine: c, fromPlan: true, crewSize: 5, area: "JBR", visitedAt: at(21, i + 1) })));
  assert.ok(r.unlocked);
  const keys = r.traits.map((t) => t.key);
  for (const k of ["night-owl", "food", "decider", "big-crew", "turf", "explorer"]) assert.ok(keys.includes(k), `expected ${k} in ${keys}`);
  assert.equal(r.headline, r.traits[0]);
  assert.match(r.traits.find((t) => t.key === "night-owl")!.evidence, /^100% /);
});

test("mornings are not night owls, and a repeat place makes a regular, not an explorer", () => {
  const same = "same-spot";
  const r = planPersonality([0, 1, 2, 3].map((d) => visit({ visitedAt: at(9, d), spotId: same, category: "cafe", crewSize: 1 })));
  assert.ok(r.unlocked);
  const keys = r.traits.map((t) => t.key);
  assert.ok(keys.includes("early-riser") && !keys.includes("night-owl"));
  assert.ok(keys.includes("regular") && !keys.includes("explorer"));
  assert.ok(keys.includes("small-table"));
});

test("no strong signal still says something", () => {
  const r = planPersonality([12, 15, 17].map((h) => visit({ visitedAt: at(h), category: null, crewSize: 3 })));
  assert.ok(r.unlocked);
  assert.equal(r.headline.key, "forming");
});
