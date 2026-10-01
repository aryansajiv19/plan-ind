import assert from "node:assert/strict";
import test from "node:test";
import { answerSummary, constraintLine, isMissingGroupPrefs, parseHostSettings, parsePrefs, relaxedNote, toGroupPref } from "../lib/gathering.ts";
import type { PlanPreferences } from "../lib/types.ts";

const ok = (value: unknown) => { const r = parsePrefs(value); assert.ok(!("error" in r), JSON.stringify(r)); return r as Exclude<typeof r, { error: string }>; };
const bad = (value: unknown) => assert.ok("error" in (parsePrefs(value) as object), `should refuse ${JSON.stringify(value)}`);

test("parsePrefs: every tap is optional and 'anywhere' stores as no origin", () => {
  assert.deepEqual(ok({}), { budgetCap: null, origin: null, vibes: [], avoid: [] });
  assert.deepEqual(ok({ budgetCap: 200, origin: "anywhere", vibes: ["chill", "rooftop"], avoid: ["loud"] }), { budgetCap: 200, origin: null, vibes: ["chill", "rooftop"], avoid: ["loud"] });
  assert.equal(ok({ origin: "marina" }).origin, "marina");
});

test("parsePrefs: refuses what is off the closed lists instead of trimming it", () => {
  bad(null); bad([]);
  bad({ budgetCap: 150 });                 // not on the ladder
  bad({ budgetCap: "100" });
  bad({ origin: "narnia" });
  bad({ vibes: ["chill", "lively", "quiet"] }); // three
  bad({ vibes: ["chill", "chill"] });          // duplicate
  bad({ vibes: ["spooky"] });
  bad({ avoid: ["crowded"] });                  // retired word
  bad({ avoid: "loud" });
});

test("parseHostSettings: skip-path settings are bounded; a radius needs an origin", () => {
  assert.deepEqual(parseHostSettings({}), { budgetCap: null, radiusKm: null, origin: null });
  const s = parseHostSettings({ budgetCap: 300, origin: "marina", radiusKm: 20 }) as { origin: { latitude: number } | null; radiusKm: number };
  assert.equal(s.radiusKm, 20);
  assert.ok(s.origin && s.origin.latitude > 25);
  assert.equal((parseHostSettings({ origin: "anywhere", radiusKm: 20 }) as { radiusKm: number | null }).radiusKm, null);
  for (const body of [{ budgetCap: -1 }, { budgetCap: 1.5 }, { radiusKm: 0 }, { radiusKm: 500 }, { origin: "narnia" }, { origin: 5 }]) {
    assert.ok("error" in (parseHostSettings(body) as object), JSON.stringify(body));
  }
});

test("isMissingGroupPrefs: only 'the SQL is not there' codes fall back; real failures do not", () => {
  for (const code of ["PGRST202", "PGRST205", "42883", "42P01"]) assert.equal(isMissingGroupPrefs(code), true, code);
  // A refusal or an outage must keep its own message: 42501 not allowed, 22023 bad input, PC429 capped, 500s, no code.
  for (const code of ["42501", "22023", "PC429", "PGRST301", "08006", "", null, undefined]) assert.equal(isMissingGroupPrefs(code), false, String(code));
});

const row = (over: Partial<PlanPreferences> = {}): PlanPreferences => ({
  plan_id: "p", user_id: "u", voter_name: "Maya", budget_cap: null, origin_value: null, origin_latitude: null, origin_longitude: null,
  vibes: [], avoid: [], updated_at: "2026-10-01T00:00:00Z", ...over,
});

test("toGroupPref and answerSummary: a stored row reads back as what was tapped", () => {
  const r = row({ budget_cap: 100, origin_value: "marina", origin_latitude: 25.08, origin_longitude: 55.14, vibes: ["chill", "quiet"], avoid: ["shisha"] });
  assert.deepEqual(toGroupPref(r).origin, { value: "marina", latitude: 25.08, longitude: 55.14 });
  assert.equal(answerSummary(r), "Up to AED 100, Coming from Dubai Marina, Chill and Quiet, No shisha");
  assert.equal(answerSummary(row()), "No preferences, that’s fine");
  assert.equal(answerSummary(row({ vibes: ["chill"] })), "Any budget, Coming from anywhere, Chill");
  assert.equal(toGroupPref(row({ origin_value: "marina" })).origin, null); // no coordinates: never half an origin
});

test("constraintLine: the group's words, never the stored 'Fair point' label", () => {
  const at = { latitude: 25.0805, longitude: 55.1403 }; // Dubai Marina
  const group = { answered: 3, budgetCap: 200, centroid: at, radiusKm: 20, relaxed: [] as ("budget" | "distance")[] };
  assert.equal(constraintLine(group), "Chosen for the group: up to AED 200 per person, within 20 km of the group’s middle");
  assert.equal(constraintLine({ ...group, budgetCap: null, radiusKm: null }), "Chosen for the group: any budget");
  assert.equal(constraintLine({ ...group, answered: 0 }), "Set by the host: up to AED 200 per person, within 20 km of Dubai Marina");
  assert.equal(constraintLine({ ...group, answered: 1, centroid: { latitude: 1, longitude: 1 } }), "Set by the host: up to AED 200 per person, within 20 km of their starting point");
  for (const s of [group, { ...group, answered: 0 }]) assert.ok(!/fair point/i.test(constraintLine(s)));
});

test("relaxedNote: says what was loosened, and nothing when nothing was", () => {
  assert.equal(relaxedNote({ relaxed: [], budgetCap: 200, radiusKm: 20 }), null);
  assert.equal(relaxedNote({ relaxed: ["distance"], budgetCap: 200, radiusKm: 30 }), "Widened to 30 km so there were enough places");
  assert.equal(relaxedNote({ relaxed: ["budget", "distance"], budgetCap: 350, radiusKm: 45 }), "Raised the budget to AED 350 and widened to 45 km so there were enough places");
});
