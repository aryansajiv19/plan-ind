import assert from "node:assert/strict";
import test from "node:test";
import {
  appleMapsUrl,
  driveMinutesEstimate,
  googleMapsUrl,
  haversineKm,
  mapEmbedUrl,
} from "../lib/directions.ts";

const zuma = { name: "Zuma", area: "DIFC", latitude: 25.2136, longitude: 55.2821 };
const noCoords = { name: "Ravi Restaurant", area: "Al Satwa", latitude: null, longitude: null };

test("drive estimate: 1.3x road factor at 26.3 km/h, rounded to 5 min", () => {
  // 10 km straight → 13 km road → 29.7 min → 30.
  assert.equal(driveMinutesEstimate(10), 30);
  assert.equal(driveMinutesEstimate(1), 5);
  assert.equal(driveMinutesEstimate(40), 120);
});

test("drive estimate stays out where it would mislead", () => {
  assert.equal(driveMinutesEstimate(0.4), null);
  assert.equal(driveMinutesEstimate(41), null); // Abu Dhabi is highway, not city traffic
  assert.equal(driveMinutesEstimate(Number.NaN), null);
});

test("haversine: Marina to DIFC is about 20 km straight line", () => {
  const km = haversineKm(25.0805, 55.1403, 25.2136, 55.2821);
  assert.ok(km > 19 && km < 21, String(km));
});

test("embed URL: keyless, coordinates when known, google.com host only", () => {
  const url = new URL(mapEmbedUrl(zuma));
  assert.equal(url.origin, "https://www.google.com"); // proxy.ts frame-src
  assert.equal(url.searchParams.get("q"), "25.2136,55.2821");
  assert.equal(url.searchParams.get("output"), "embed");
  assert.equal(url.searchParams.get("key"), null);
  assert.equal(new URL(mapEmbedUrl(noCoords)).searchParams.get("q"), "Ravi Restaurant, Al Satwa, Dubai");
});

test("deep links fall back to the name, and to the address when there is one", () => {
  assert.equal(new URL(googleMapsUrl(zuma)).searchParams.get("query"), "25.2136,55.2821");
  assert.equal(new URL(googleMapsUrl(noCoords)).searchParams.get("query"), "Ravi Restaurant, Al Satwa, Dubai");
  assert.equal(new URL(googleMapsUrl({ ...noCoords, address: "Al Satwa Rd" })).searchParams.get("query"), "Al Satwa Rd");
  const apple = new URL(appleMapsUrl(zuma));
  assert.equal(apple.origin, "https://maps.apple.com");
  assert.equal(apple.searchParams.get("q"), "Zuma");
  assert.equal(apple.searchParams.get("ll"), "25.2136,55.2821");
  assert.equal(new URL(appleMapsUrl(noCoords)).searchParams.get("ll"), null);
});

test("a stored Google place id pins the Maps link once migration 063 lands", () => {
  const url = new URL(googleMapsUrl({ ...zuma, google_place_id: "ChIJAbCdEfGhIjKlMnOp" }));
  assert.equal(url.searchParams.get("query_place_id"), "ChIJAbCdEfGhIjKlMnOp");
  // A malformed id is ignored, never passed through.
  assert.equal(new URL(googleMapsUrl({ ...zuma, google_place_id: "x y" })).searchParams.get("query"), "25.2136,55.2821");
});
