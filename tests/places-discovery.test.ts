import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  buildDiscoveryRequest, candidatesCsv, dedupeCandidates, DISCOVERY_FIELD_MASK, DISCOVERY_QUERIES, discoveryCost,
  discoveryGrid, parseDiscoveryPage,
} from "../lib/places/discovery.ts";
import { CATEGORIES } from "../components/categoryGroups.ts";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/places/${name}`, import.meta.url), "utf8"));
const marina = discoveryGrid(["dinner"], ["Dubai Marina"])[0];

test("the field mask is pinned: Enterprise, no Atmosphere field", () => {
  assert.equal(DISCOVERY_FIELD_MASK, "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.priceLevel,places.userRatingCount,places.websiteUri,nextPageToken");
  assert.doesNotMatch(DISCOVERY_FIELD_MASK, /reviews|editorialSummary|serves|photos|rating,/);
});

test("the grid covers every category the app lists, x 20 areas; unknown names are refused", () => {
  assert.deepEqual(Object.keys(DISCOVERY_QUERIES).sort(), CATEGORIES.map((c) => c.key).sort());
  assert.equal(discoveryGrid([], []).length, 23 * 20);
  assert.throws(() => discoveryGrid(["casino"], []), /Unknown category/);
  assert.throws(() => discoveryGrid([], ["Atlantis City"]), /Unknown area/);
});

test("requests: key only in the header, typed categories filter strictly, text-only ones don't, pages carry the token", () => {
  const req = buildDiscoveryRequest(marina, "k3y", "https://places.googleapis.com", "tok");
  assert.equal(req.init.headers["X-Goog-Api-Key"], "k3y");
  assert.doesNotMatch(req.url, /k3y/);
  const body = JSON.parse(req.init.body!);
  assert.equal(body.textQuery, "restaurant in Dubai Marina, Dubai");
  assert.deepEqual([body.includedType, body.strictTypeFiltering, body.pageSize, body.pageToken], ["restaurant", true, 20, "tok"]);
  const padel = JSON.parse(buildDiscoveryRequest(discoveryGrid(["padel"], ["JLT"])[0], "k", "https://places.googleapis.com").init.body!);
  assert.equal(padel.includedType, undefined);
  assert.throws(() => buildDiscoveryRequest(marina, "k", "https://evil.example"), /places.googleapis.com/);
});

test("pages parse to candidates (a bad id dropped), dedupe keeps the first sighting and marks catalogue ids", () => {
  const one = parseDiscoveryPage(fixture("discovery-page-1.json"), marina);
  const two = parseDiscoveryPage(fixture("discovery-page-2.json"), marina);
  assert.equal(one.nextPageToken, "fixture-page-2");
  assert.equal(two.nextPageToken, null);
  assert.equal(one.candidates.length, 3, "the spaced id is refused");
  const rows = dedupeCandidates([...one.candidates, ...two.candidates], new Set(["ChIJfixtureKnownSpotBBBB2"]));
  assert.deepEqual(rows.map((r) => [r.name, r.known]), [
    ["Fixture Grill Marina", false], ["Already In Catalogue", true], ["=HYPERLINK(\"x\")", false], ["Page Two Bistro", false],
  ]);
  assert.deepEqual([rows[0].lat, rows[0].price_level, rows[0].rating_count, rows[0].area], [25.0781, "PRICE_LEVEL_MODERATE", 1840, "Dubai Marina"]);
});

test("the CSV quotes everything and defuses formulas, never numbers", () => {
  const rows = dedupeCandidates(parseDiscoveryPage(fixture("discovery-page-1.json"), marina).candidates, new Set());
  const csv = candidatesCsv(rows).split("\n");
  assert.equal(csv[0], "name,category,area,lat,lng,place_id,price_level,rating_count,known,address,website");
  assert.match(csv[3], /^"'=HYPERLINK\(""x""\)"/);
  assert.match(csv[1], /"25\.0781","55\.1402"/);
});

test("cost: the full grid fits the free tier; pages and the cap bound it", () => {
  assert.deepEqual(discoveryCost(460, 1, 900), { requests: 460, maxCandidates: 9200, usdIfFreeTierUnused: 0, usdIfFreeTierSpent: 16.1 });
  assert.deepEqual(discoveryCost(460, 3, 900).requests, 900);
  assert.equal(discoveryCost(460, 3, 5000).usdIfFreeTierUnused, 13.3); // 1,380 - 1,000 free = 380 x $35/1,000
});
