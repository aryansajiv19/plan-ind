import assert from "node:assert/strict";
import test from "node:test";
import { answerSummary, parseHostSettings, parsePrefs, relaxedNote, toGroupPref } from "../lib/gathering.ts";
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

const row = (over: Partial<PlanPreferences> = {}): PlanPreferences => ({
  plan_id: "p", user_id: "u", voter_name: "Maya", budget_cap: null, origin_value: null, origin_latitude: null, origin_longitude: null,
  vibes: [], avoid: [], updated_at: "2026-10-01T00:00:00Z", ...over,
});

test("toGroupPref and answerSummary: a stored row reads back as what was tapped", () => {
  const r = row({ budget_cap: 100, origin_value: "marina", origin_latitude: 25.08, origin_longitude: 55.14, vibes: ["chill", "quiet"], avoid: ["shisha"] });
  assert.deepEqual(toGroupPref(r).origin, { value: "marina", latitude: 25.08, longitude: 55.14 });
  assert.equal(answerSummary(r), "Up to AED 100, From Dubai Marina, Chill and Quiet, No shisha");
  assert.equal(answerSummary(row()), "Any, From anywhere");
  assert.equal(toGroupPref(row({ origin_value: "marina" })).origin, null); // no coordinates: never half an origin
});

test("relaxedNote: says what was loosened, and nothing when nothing was", () => {
  assert.equal(relaxedNote({ relaxed: [], budgetCap: 200, radiusKm: 20 }), null);
  assert.equal(relaxedNote({ relaxed: ["distance"], budgetCap: 200, radiusKm: 30 }), "Widened to 30 km so there were enough places");
  assert.equal(relaxedNote({ relaxed: ["budget", "distance"], budgetCap: 350, radiusKm: 45 }), "Raised the budget to AED 350 and widened to 45 km so there were enough places");
});
