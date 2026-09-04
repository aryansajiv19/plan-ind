import assert from "node:assert/strict";
import test from "node:test";
import { matchCandidates } from "../lib/place-import/match.ts";
import type { Spot } from "../lib/types.ts";
import type { ExtractedClues } from "../lib/place-import/oembed.ts";

function spot(id: string, overrides: Partial<Spot> = {}): Spot {
  return {
    id,
    name: `Spot ${id}`,
    category: "dinner",
    minimum_age: 0,
    area: "Downtown",
    cuisine: "Levantine",
    price_band: "$$",
    min_spend: 100,
    open_till: "12am",
    vibe: "relaxed",
    photo_url: null,
    description: null,
    booking_url: null,
    source: "curated",
    visibility: "community",
    created_by_user_id: null,
    address: null,
    latitude: null,
    longitude: null,
    ...overrides,
  };
}

function clues(overrides: Partial<ExtractedClues> = {}): ExtractedClues {
  return { title: null, author: null, description: null, thumbnailUrl: null, sourceProvider: "web", ...overrides };
}

test("empty clue text yields no candidates", () => {
  const result = matchCandidates(clues(), [spot("a", { name: "Zheng He's" })]);
  assert.deepEqual(result, []);
});

test("an exact name match in the title scores highest and comes first", () => {
  const spots = [
    spot("a", { name: "Zheng He's", cuisine: "Chinese" }),
    spot("b", { name: "Ravi Restaurant", cuisine: "Pakistani" }),
  ];
  const result = matchCandidates(clues({ title: "Dinner at Zheng He's tonight" }), spots);
  assert.equal(result[0].spot.id, "a");
  assert.ok(result[0].score > 0);
});

test("unrelated text against the whole catalog matches nothing", () => {
  const spots = [spot("a", { name: "Zheng He's" }), spot("b", { name: "Ravi Restaurant" })];
  const result = matchCandidates(clues({ title: "My cat sleeping in a sunbeam" }), spots);
  assert.deepEqual(result, []);
});

test("results are ranked, capped at 5, and stopwords don't inflate scores", () => {
  const spots = Array.from({ length: 8 }, (_, i) => spot(`s${i}`, { name: `The Spot at the Dubai ${i}` }));
  const result = matchCandidates(clues({ title: "the a dubai spot" }), spots);
  assert.ok(result.length <= 5);
  for (let i = 1; i < result.length; i++) assert.ok(result[i - 1].score >= result[i].score);
});

test("description contributes when the title alone doesn't match", () => {
  const spots = [spot("a", { name: "Zheng He's", cuisine: "Chinese", vibe: "elegant" })];
  const result = matchCandidates(clues({ title: "Best night out", description: "authentic Chinese elegant dining" }), spots);
  assert.equal(result.length, 1);
  assert.equal(result[0].spot.id, "a");
});
