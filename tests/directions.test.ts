import assert from "node:assert/strict";
import test from "node:test";
import {
  appleDirectionsUrl,
  appleMapsUrl,
  directionsUrl,
  driveMinutesEstimate,
  isDubaiRushHour,
  uberUrl,
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

// P16: directions from wherever the viewer is, no API key.
test("Google directions: no origin (device location), the mode, and the place id when stored", () => {
  const url = new URL(directionsUrl({ ...zuma, google_place_id: "ChIJ-zuma" }, "transit"));
  assert.equal(url.host, "www.google.com");
  assert.equal(url.searchParams.get("destination"), "25.2136,55.2821");
  assert.equal(url.searchParams.get("travelmode"), "transit");
  assert.equal(url.searchParams.get("destination_place_id"), "ChIJ-zuma");
  assert.equal(url.searchParams.has("origin"), false);
  assert.equal(new URL(directionsUrl(zuma, "driving", { latitude: 25.1, longitude: 55.2 })).searchParams.get("origin"), "25.1,55.2");
  assert.equal(new URL(directionsUrl(noCoords, "walking")).searchParams.get("destination"), "Ravi Restaurant, Al Satwa, Dubai");
});

test("Apple directions: daddr and the mode flag, starting from the current location", () => {
  const url = new URL(appleDirectionsUrl(zuma, "walking"));
  assert.equal(url.host, "maps.apple.com");
  assert.equal(url.searchParams.get("daddr"), "25.2136,55.2821");
  assert.equal(url.searchParams.get("dirflg"), "w");
  assert.equal(url.searchParams.has("saddr"), false);
});

test("Uber: the documented /looking link with a JSON drop[0]; none without coordinates", () => {
  const url = new URL(uberUrl(zuma)!);
  assert.equal(url.origin + url.pathname, "https://m.uber.com/looking");
  assert.equal(url.searchParams.get("pickup"), "my_location");
  assert.deepEqual(JSON.parse(url.searchParams.get("drop[0]")!), { latitude: 25.2136, longitude: 55.2821, addressLine1: "Zuma" });
  assert.equal(uberUrl(noCoords), null);
});

test("rush hour is 7-10 and 17-20 on the Dubai clock only", () => {
  assert.equal(isDubaiRushHour(new Date("2026-09-27T04:00:00Z")), true);  // 08:00 Dubai
  assert.equal(isDubaiRushHour(new Date("2026-09-27T06:30:00Z")), false); // 10:30
  assert.equal(isDubaiRushHour(new Date("2026-09-27T13:30:00Z")), true);  // 17:30
  assert.equal(isDubaiRushHour(new Date("2026-09-27T16:00:00Z")), false); // 20:00
});
