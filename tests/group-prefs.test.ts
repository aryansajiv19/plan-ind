import assert from "node:assert/strict";
import test from "node:test";
import {
  dealForGroup, fitFor, groupAffinity, groupConstraints, originFor, summariseGroup,
  type GroupPref,
} from "../lib/group-prefs.ts";
import { distanceKm } from "../lib/dubai-areas.ts";
import { dealFromPool, type DealSpotRow } from "../lib/spots/match.ts";
import { seededRng } from "../lib/group-prefs.ts";

const TODAY = "2026-10-01";

function spot(id: string, overrides: Partial<DealSpotRow> = {}): DealSpotRow {
  return {
    id, name: `Spot ${id}`, category: "dinner", area: "Nowhere Known", cuisine: "Levantine",
    min_spend: 100, vibe: "relaxed", description: null, latitude: null, longitude: null,
    minimum_age: null, photo_url: "https://photos.test/a.jpg", ...overrides,
  };
}

const MARINA = { latitude: 25.0805, longitude: 55.1403 };
const MIDDLE = { latitude: 25.15, longitude: 55.28 };
const MIRDIF = { latitude: 25.22, longitude: 55.42 };
/** n spots at a point, ids prefixed so a result is readable. */
const cluster = (prefix: string, n: number, at: { latitude: number; longitude: number }, o: Partial<DealSpotRow> = {}) =>
  Array.from({ length: n }, (_, i) => spot(`${prefix}${i}`, { ...at, ...o }));

function pref(name: string, o: Partial<GroupPref> = {}): GroupPref {
  return { name, budgetCap: null, origin: null, vibes: [], avoid: [], ...o };
}
const marinaPerson = pref("Mia", { origin: originFor("marina")! });
const mirdifPerson = pref("Omar", { origin: originFor("mirdif")! });

const deal = (pool: DealSpotRow[], prefs: GroupPref[], seed = "plan-1", extra: object = {}) =>
  dealForGroup({ pool, prefs, category: "dinner", seed, today: TODAY, ...extra });
const idsOf = (o: ReturnType<typeof dealForGroup>) => {
  assert.ok("ids" in o, "expected a deal");
  return o.ids;
};

test("fairness: a Marina + Mirdif pair is dealt the middle, not Marina's doorstep", () => {
  const pool = [...cluster("mid", 9, MIDDLE), ...cluster("mar", 9, MARINA)];
  const ids = idsOf(deal(pool, [marinaPerson, mirdifPerson]));
  assert.deepEqual(ids.filter((id) => id.startsWith("mar")), []);
  assert.equal(ids.length, 9);
});

test("fair point minimises the longest trip: the midpoint of two, not either end", () => {
  const point = summariseGroup([marinaPerson, mirdifPerson]).centroid!;
  assert.ok(Math.abs(point.latitude - 25.15) < 0.01 && Math.abs(point.longitude - 55.28) < 0.01);
});

test("fair point guards the worst trip, not the average (3 in Marina, 1 in Mirdif)", () => {
  // Averaging distance would park the point at Marina (7.8 km mean, 31 km worst).
  const prefs = [marinaPerson, { ...marinaPerson, name: "B" }, { ...marinaPerson, name: "C" }, mirdifPerson];
  const point = summariseGroup(prefs).centroid!;
  assert.ok(distanceKm(point, MIRDIF) < 25, "the far friend is not left with the whole trip");
});

test("budget: the group cap is the lowest cap, and nothing dearer is dealt", () => {
  const pool = [...cluster("cheap", 9, MIDDLE, { min_spend: 90 }), ...cluster("dear", 9, MIDDLE, { min_spend: 300 })];
  const prefs = [pref("A", { budgetCap: 350 }), pref("B", { budgetCap: 100 }), pref("C", { budgetCap: 200 })];
  assert.equal(groupConstraints(prefs).maxBudget, 100);
  const result = deal(pool, prefs);
  assert.ok(idsOf(result).every((id) => id.startsWith("cheap")));
  assert.deepEqual((result as { summary: { relaxed: string[] } }).summary.relaxed, []);
});

test("budget relaxes to the second-lowest cap, and says so", () => {
  const pool = [...cluster("cheap", 4, MIDDLE, { min_spend: 90 }), ...cluster("mid", 8, MIDDLE, { min_spend: 180 })];
  const result = deal(pool, [pref("A", { budgetCap: 100 }), pref("B", { budgetCap: 200 }), pref("C", { budgetCap: 350 })]);
  assert.equal(idsOf(result).length, 9);
  assert.deepEqual((result as { summary: { relaxed: string[]; budgetCap: number } }).summary.relaxed, ["budget"]);
  assert.equal((result as { summary: { budgetCap: number } }).summary.budgetCap, 200);
});

test("distance relaxes after budget, and says so", () => {
  // 20 km from the midpoint holds none of these; 30 km does.
  const far = { latitude: MIDDLE.latitude + 0.22, longitude: MIDDLE.longitude }; // ~24 km north
  const result = deal(cluster("far", 9, far), [marinaPerson, mirdifPerson]);
  assert.equal(idsOf(result).length, 9);
  const out = result as { summary: { relaxed: string[] }; radiusKm: number };
  assert.deepEqual(out.summary.relaxed, ["distance"]);
  assert.equal(out.radiusKm, 30);
});

test("tooFew when even the widest relaxation cannot fill nine", () => {
  assert.deepEqual(deal(cluster("a", 8, MIDDLE), [marinaPerson, mirdifPerson]), { tooFew: true });
  assert.deepEqual(deal(cluster("a", 9, MIDDLE, { min_spend: 900 }), [pref("A", { budgetCap: 100 }), pref("B", { budgetCap: 200 })]), { tooFew: true });
});

test("avoid: shared by two it excludes, held by one it only penalises", () => {
  const pool = [...cluster("ok", 9, MIDDLE), ...cluster("loud", 3, MIDDLE, { vibe: "loud party" })];
  const shared = deal(pool, [pref("A", { avoid: ["loud"] }), pref("B", { avoid: ["loud"] })]);
  assert.ok(idsOf(shared).every((id) => id.startsWith("ok")));

  const lone = [pref("A", { avoid: ["loud"] }), pref("B", { budgetCap: 200 })];
  assert.deepEqual(groupConstraints(lone).avoidKeywords, []);
  // One person's avoid is not a filter: loud spots stay eligible...
  assert.ok(deal(cluster("loud", 9, MIDDLE, { vibe: "loud party" }), lone) && "ids" in deal(cluster("loud", 9, MIDDLE, { vibe: "loud party" }), lone));
  // ...but score lower than a quiet one.
  const score = groupAffinity(lone);
  assert.ok(score(spot("q"))! > score(spot("l", { vibe: "loud party" }))!);
  assert.ok(idsOf(deal(pool, lone)).every((id) => id.startsWith("ok")), "penalty keeps loud spots out when there is room");
});

test("vibes are a soft boost: matching spots are dealt first, others fill the rest", () => {
  const pool = [...cluster("zchill", 5, MIDDLE, { vibe: "chill lounge" }), ...cluster("plain", 12, MIDDLE)];
  const ids = idsOf(deal(pool, [pref("A", { vibes: ["chill"] }), pref("B", { vibes: ["chill"] })]));
  assert.equal(ids.filter((id) => id.startsWith("zchill")).length, 5);
  assert.equal(ids.length, 9);
});

test("deterministic: same seed same deal, another seed another order or set", () => {
  const pool = cluster("s", 30, MIDDLE);
  const prefs = [marinaPerson, mirdifPerson];
  assert.deepEqual(deal(pool, prefs, "x"), deal(pool, prefs, "x"));
  assert.deepEqual(deal([...pool].reverse(), prefs, "x"), deal(pool, prefs, "x"), "input order is irrelevant");
  const seen = new Set(["a", "b", "c", "d", "e"].map((s) => idsOf(deal(pool, prefs, s)).join()));
  assert.ok(seen.size > 1, "seeds must differ");
});

test("zero or one answer is the old deal on the host's settings", () => {
  const pool = [...cluster("a", 8, MIDDLE), ...cluster("b", 8, MARINA)];
  const hostConstraints = { maxBudget: 150 };
  const old = dealFromPool({ category: "dinner", count: 9, pool: [...pool].sort((a, b) => a.id.localeCompare(b.id)), ratings: [], constraints: hostConstraints, rng: seededRng("s"), today: TODAY });
  for (const prefs of [[], [pref("blank")], [pref("A", { budgetCap: 100, origin: originFor("marina")! })]]) {
    const result = deal(pool, prefs, "s", { hostConstraints });
    assert.deepEqual(idsOf(result), old);
  }
});

test("age rules stay: an age-gated pool cannot be dealt to an underage caller", () => {
  const pool = cluster("n", 12, MIDDLE, { category: "nightlife" });
  assert.deepEqual(dealForGroup({ pool, prefs: [marinaPerson, mirdifPerson], category: "nightlife", seed: "s", today: TODAY, age: 15 }), { tooFew: true });
});

test("a spot with no photo is never dealt", () => {
  const pool = [...cluster("ph", 9, MIDDLE), ...cluster("bare", 5, MIDDLE, { photo_url: null, google_place_id: null })];
  assert.ok(idsOf(deal(pool, [marinaPerson, mirdifPerson])).every((id) => id.startsWith("ph")));
  assert.deepEqual(deal([...cluster("ph", 8, MIDDLE), ...cluster("bare", 5, MIDDLE, { photo_url: null })], [marinaPerson, mirdifPerson]), { tooFew: true });
});

test("fitFor: true claims only, at most three", () => {
  const prefs = [pref("A", { budgetCap: 150, origin: originFor("marina")!, vibes: ["chill"] }), pref("B", { budgetCap: 200, origin: originFor("mirdif")!, vibes: ["chill"] })];
  const fits = fitFor(spot("x", { ...MIDDLE, min_spend: 120, vibe: "chill" }), prefs);
  assert.deepEqual(fits, ["17 km or less for all 2", "Fits everyone's budget (up to AED 150)", "Matches the chill vibe for 2"]);
});

test("fitFor omits what it cannot prove", () => {
  const prefs = [pref("A", { budgetCap: 150, origin: originFor("marina")!, vibes: ["chill"] }), pref("B", { budgetCap: 200 })];
  const over = fitFor(spot("o", { ...MIDDLE, min_spend: 400, vibe: "loud" }), prefs);
  assert.ok(!over.some((s) => s.includes("budget")), "over the cap");
  assert.ok(!over.some((s) => s.includes("vibe")), "vibe absent from the text");
  const unknown = fitFor(spot("u", { min_spend: 0 }), prefs);
  assert.deepEqual(unknown, [], "no price, no coordinates, no area match: no claims");
  assert.ok(fitFor(spot("p", MIDDLE), prefs)[0].endsWith("for 1 of 2"), "partial origins are not 'all'");
  assert.deepEqual(fitFor(spot("n", MIDDLE), []), []);
});
