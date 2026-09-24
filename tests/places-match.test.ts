import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseTextSearch } from "../lib/places/client.ts";
import { matchPlace, nameSimilarity, type MatchSpot } from "../lib/places/match.ts";

const results = (name: string) =>
  parseTextSearch(JSON.parse(readFileSync(new URL(`./fixtures/places/${name}`, import.meta.url), "utf8")));
const spots = JSON.parse(readFileSync(new URL("./fixtures/places/spots.json", import.meta.url), "utf8")) as MatchSpot[];
const spot = (name: string) => spots.find((row) => row.name === name)!;

test("name and own-pin agreement auto-approves (Bu Qtair, 30 m apart)", () => {
  const match = matchPlace(spot("Bu Qtair"), results("text-search-bu-qtair.json"));
  assert.equal(match.confidence, "high");
  assert.equal(match.place?.id, "ChIJbuQtairFixture0000001");
  assert.equal(match.distanceFrom, "spot");
  assert.ok(match.distanceKm! < 0.1);
});

test("an exact name with only an area centroid goes to a human, never auto-approved", () => {
  const match = matchPlace(spot("Tresind Studio"), results("text-search-tresind.json"));
  assert.equal(match.confidence, "review");
  assert.equal(match.nameScore, 1);
  assert.equal(match.distanceFrom, "area");
  assert.ok(match.reasons.some((reason) => reason.includes("area centroid")));
});

test("two same-named branches in range are ambiguous, even when one sits on the pin", () => {
  const match = matchPlace(spot("Black Tap"), results("text-search-black-tap.json"));
  assert.equal(match.confidence, "review");
  assert.equal(match.place?.id, "ChIJblackTapJBRFixture001", "the nearer branch is still the one proposed");
  assert.ok(match.reasons.some((reason) => reason.startsWith("ambiguous")));
});

test("a one-token name does not match a longer name across the city (Saffron != Saffron Spice Kitchen, Deira)", () => {
  const match = matchPlace(spot("Saffron"), results("text-search-saffron.json"));
  assert.equal(match.confidence, "reject");
});

test("no results is a reject, not a guess", () => {
  const match = matchPlace(spot("Hummingbird"), []);
  assert.equal(match.confidence, "reject");
  assert.equal(match.place, null);
});

test("a place outside Dubai is rejected however well the name matches", () => {
  const [place] = results("text-search-bu-qtair.json");
  const match = matchPlace(spot("Bu Qtair"), [{ ...place, location: { latitude: 51.5, longitude: -0.12 } }]);
  assert.equal(match.confidence, "reject");
  assert.deepEqual(match.reasons, ["outside Dubai"]);
});

test("the same result far from the spot's own pin is rejected (the wrong branch)", () => {
  const [place] = results("text-search-bu-qtair.json");
  const match = matchPlace(spot("Bu Qtair"), [{ ...place, location: { latitude: 25.2, longitude: 55.3 } }]);
  assert.equal(match.confidence, "reject");
});

test("ranking is deterministic: API order does not change the answer", () => {
  const list = results("text-search-black-tap.json");
  assert.deepEqual(matchPlace(spot("Black Tap"), list), matchPlace(spot("Black Tap"), [...list].reverse()));
});

test("name similarity is symmetric F1 on shared tokens", () => {
  assert.equal(nameSimilarity("SoBe", "SOBE"), 1);
  assert.equal(nameSimilarity("Bu Qtair", "Bu Qtair Restaurant"), 0.8);
  // {hummingbird} vs {ruby, throated, hummingbird, feeder, shop}: P=1, R=1/5.
  assert.ok(Math.abs(nameSimilarity("Hummingbird", "Ruby-throated Hummingbird Feeder Shop") - 1 / 3) < 1e-9);
});
