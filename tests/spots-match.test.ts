import assert from "node:assert/strict";
import test from "node:test";
import {
  categoryFamily,
  dealFromPool,
  eligibleDealSpots,
  type DealConstraints,
  type DealRatingRow,
  type DealSpotRow,
} from "../lib/spots/match.ts";

function spot(id: string, overrides: Partial<DealSpotRow> = {}): DealSpotRow {
  return {
    id,
    name: `Spot ${id}`,
    category: "dinner",
    area: "Dubai Marina",
    cuisine: "Levantine",
    min_spend: 100,
    vibe: "relaxed",
    description: null,
    latitude: null,
    longitude: null,
    minimum_age: null,
    ...overrides,
  };
}

function rating(spotId: string, stars: number, again = false): DealRatingRow {
  return { spot_id: spotId, stars, again };
}

/** Fisher-Yates with j === i for every i: the shuffle becomes the identity. */
const keepOrder = () => 0.999999;

/** An exact draw sequence, so a shuffled result is still assertable. */
function rngSequence(values: readonly number[]): () => number {
  let index = 0;
  return () => {
    assert.ok(index < values.length, "rng sequence exhausted");
    return values[index++];
  };
}

/** count 0 imposes no minimum, so this is the raw hard-filter output. */
function eligible(pool: readonly DealSpotRow[], constraints: DealConstraints): string[] {
  const result = eligibleDealSpots({ pool, count: 0, constraints });
  assert.ok(result, "count 0 can never fail to fill");
  return result.map((s) => s.id);
}

/** Ranked order is observable when count === pool size and the shuffle is the identity. */
function deal(
  pool: readonly DealSpotRow[],
  options: Partial<Parameters<typeof dealFromPool>[0]> = {},
): string[] | null {
  return dealFromPool({
    category: "dinner",
    count: pool.length,
    pool,
    ratings: [],
    rng: keepOrder,
    ...options,
  });
}

test("a category inside a family expands to the family; an unknown one stands alone", () => {
  assert.deepEqual(categoryFamily("cafe"), ["dinner", "cafe", "brunch", "dessert", "shisha"]);
  assert.deepEqual(categoryFamily("dinner"), ["dinner", "cafe", "brunch", "dessert", "shisha"]);
  assert.deepEqual(categoryFamily("karaoke"), ["vibes", "nightlife", "live_music", "karaoke"]);
  assert.deepEqual(categoryFamily("beach_club"), ["beach", "beach_club", "water"]);
  assert.deepEqual(categoryFamily("pottery"), ["pottery"]);
  assert.deepEqual(categoryFamily(""), [""]);
});

test("age gates on the stricter of the category minimum and the spot's own minimum_age", () => {
  const pool = [
    spot("shisha-18", { category: "shisha" }),
    spot("nightlife-21", { category: "nightlife" }),
    spot("dinner-25", { minimum_age: 25 }),
    spot("shisha-row-21", { category: "shisha", minimum_age: 21 }),
    spot("open", {}),
  ];

  assert.deepEqual(eligible(pool, { age: 17 }), ["open"]);
  assert.deepEqual(eligible(pool, { age: 18 }), ["shisha-18", "open"]);
  assert.deepEqual(eligible(pool, { age: 20 }), ["shisha-18", "open"]);
  assert.deepEqual(eligible(pool, { age: 21 }), [
    "shisha-18",
    "nightlife-21",
    "shisha-row-21",
    "open",
  ]);
  assert.deepEqual(eligible(pool, { age: 24 }), [
    "shisha-18",
    "nightlife-21",
    "shisha-row-21",
    "open",
  ]);
  assert.deepEqual(eligible(pool, { age: 25 }), pool.map((s) => s.id));

  // No age supplied means no age gate at all: every caller must pass one.
  // The route does (it falls back to MIN_ACCOUNT_AGE rather than omitting it).
  assert.deepEqual(eligible(pool, {}), pool.map((s) => s.id));
});

test("min_spend above the budget drops; equal to the budget is kept", () => {
  const pool = [
    spot("under", { min_spend: 99 }),
    spot("equal", { min_spend: 100 }),
    spot("over", { min_spend: 101 }),
    spot("free", { min_spend: 0 }),
  ];

  assert.deepEqual(eligible(pool, { maxBudget: 100 }), ["under", "equal", "free"]);
  assert.deepEqual(eligible(pool, { maxBudget: 0 }), ["free"]);
  assert.deepEqual(eligible(pool, { maxBudget: null }), pool.map((s) => s.id));
  assert.deepEqual(eligible(pool, {}), pool.map((s) => s.id));
});

test("avoid keywords hard-filter case-insensitively across name, cuisine, vibe and description", () => {
  const pool = [
    spot("by-name", { name: "Sushi Counter" }),
    spot("by-cuisine", { cuisine: "SUSHI" }),
    spot("by-vibe", { vibe: "late-night sushi energy" }),
    spot("by-description", { description: "Omakase Sushi tasting menu" }),
    spot("safe", {}),
  ];

  assert.deepEqual(eligible(pool, { avoidKeywords: ["SuShI"] }), ["safe"]);
  assert.deepEqual(eligible(pool, { avoidKeywords: [] }), pool.map((s) => s.id));

  // Avoid outranks vibe: a soft boost cannot rescue a hard-filtered spot.
  assert.deepEqual(
    deal(pool, { constraints: { avoidKeywords: ["sushi"], vibeKeywords: ["sushi"] }, count: 1 }),
    ["safe"],
  );

  // Documented, not endorsed: matching is plain substring, so "bar" removes
  // "Barbecue" and "Barasti". Reported to backend-data.
  assert.deepEqual(eligible([spot("bbq", { cuisine: "Barbecue" })], { avoidKeywords: ["bar"] }), []);
});

test("area is outside the searched text, so avoid keywords never filter on it", () => {
  const pool = [spot("pier", { name: "Pier Seven", area: "Dubai Marina" })];
  assert.deepEqual(eligible(pool, { avoidKeywords: ["marina"] }), ["pier"]);
});

test("vibe keywords reorder the pool without changing its membership", () => {
  const pool = [spot("a"), spot("b", { vibe: "rooftop skyline" }), spot("c")];

  const neutral = deal(pool);
  const boosted = deal(pool, { constraints: { vibeKeywords: ["ROOFTOP"] } });

  assert.deepEqual(neutral, ["a", "b", "c"]);
  assert.deepEqual(boosted, ["b", "a", "c"]);
  assert.deepEqual([...boosted!].sort(), [...neutral!].sort());
});

test("an unrated spot outranks a poorly rated one and loses to a well rated one", () => {
  const pool = [spot("poor"), spot("unrated"), spot("good"), spot("great")];
  const ratings = [
    rating("poor", 3),
    rating("poor", 3),
    rating("good", 4),
    rating("great", 5, true),
  ];

  // Priors: poor 3.0, unrated 3.6, good 4.0, great 6.0 (stars + again rate).
  assert.deepEqual(deal(pool, { ratings }), ["great", "good", "unrated", "poor"]);
});

test("the requested category outranks its family siblings, all else equal", () => {
  const pool = [spot("sibling", { category: "brunch" }), spot("exact", { category: "dinner" })];
  assert.deepEqual(deal(pool, { category: "dinner" }), ["exact", "sibling"]);
  assert.deepEqual(deal(pool, { category: "brunch" }), ["sibling", "exact"]);
});

test("a pool that cannot fill the count returns null", () => {
  const pool = [spot("a"), spot("b")];

  assert.equal(deal(pool, { count: 3 }), null);
  assert.equal(eligibleDealSpots({ pool, count: 3 }), null);
  assert.deepEqual(deal(pool, { count: 2 }), ["a", "b"]);

  // Filters are applied before the count check.
  const three = [spot("a"), spot("b"), spot("c", { min_spend: 900 })];
  assert.equal(deal(three, { count: 3, constraints: { maxBudget: 100 } }), null);
  assert.equal(deal(three, { count: 3, excludeIds: ["a"] }), null);
  assert.deepEqual(deal(three, { count: 2, excludeIds: ["a"] }), ["b", "c"]);
});

test("been spots are skipped unless skipping them would starve the draw", () => {
  const three = [spot("a"), spot("b"), spot("c")];
  assert.deepEqual(deal(three, { count: 2, been: ["a"] }), ["b", "c"]);

  const two = [spot("a"), spot("b")];
  assert.deepEqual(deal(two, { count: 2, been: ["a"] }), ["a", "b"]);
});

test("the rng, not the ranking, chooses within the shortlist", () => {
  const pool = [spot("a"), spot("b"), spot("c")];

  // count 2 shortlists the top min(count * 2, pool) = 3, then shuffles.
  // i=2: j=floor(0*3)=0 -> [c,b,a]; i=1: j=floor(0*2)=0 -> [b,c,a]; take 2.
  assert.deepEqual(dealFromPool({
    category: "dinner",
    count: 2,
    pool,
    ratings: [],
    rng: rngSequence([0, 0]),
  }), ["b", "c"]);

  // i=2: j=floor(0.5*3)=1 -> [a,c,b]; i=1: j=floor(0.99*2)=1 -> unchanged; take 2.
  assert.deepEqual(dealFromPool({
    category: "dinner",
    count: 2,
    pool,
    ratings: [],
    rng: rngSequence([0.5, 0.99]),
  }), ["a", "c"]);
});

test("the shortlist is capped at twice the count, so the tail of the ranking cannot be drawn", () => {
  const pool = [spot("a"), spot("b"), spot("c"), spot("d"), spot("e")];
  const drawn = new Set<string>();
  for (const draws of [[0, 0, 0, 0], [0.99, 0.99, 0.99, 0.99], [0.5, 0.5, 0.5, 0.5]]) {
    dealFromPool({
      category: "dinner",
      count: 2,
      pool,
      ratings: [],
      rng: rngSequence(draws),
    })?.forEach((id) => drawn.add(id));
  }
  assert.deepEqual([...drawn].sort(), ["a", "b", "c", "d"]);
});

test("same pool, constraints and rng produce an identical draw every run", () => {
  const pool = [
    spot("a", { vibe: "rooftop" }),
    spot("b", { min_spend: 80 }),
    spot("c", { category: "brunch" }),
    spot("d", { minimum_age: 21 }),
  ];
  const ratings = [rating("a", 4), rating("c", 5, true), rating("c", 2)];
  const constraints: DealConstraints = {
    age: 21,
    maxBudget: 200,
    vibeKeywords: ["rooftop"],
    avoidKeywords: ["shisha"],
  };
  const draws = [0.3, 0.7, 0.1];
  const run = () => dealFromPool({
    category: "dinner",
    count: 3,
    pool,
    ratings,
    constraints,
    rng: rngSequence(draws),
  });

  const first = run();
  assert.equal(first?.length, 3);
  assert.deepEqual(run(), first);
  assert.deepEqual(run(), first);
});

test("the affinity hook overrides the keyword score when it returns a number", () => {
  const pool = [spot("a", { vibe: "rooftop" }), spot("b"), spot("c")];
  const constraints: DealConstraints = { vibeKeywords: ["rooftop"] };

  assert.deepEqual(deal(pool, { constraints }), ["a", "b", "c"]);
  assert.deepEqual(
    deal(pool, { constraints, embed: (s) => (s.id === "c" ? 2 : null) }),
    ["c", "a", "b"],
  );
  // null means "nothing to score with", so the keyword score still applies.
  assert.deepEqual(deal(pool, { constraints, embed: () => null }), ["a", "b", "c"]);
});
