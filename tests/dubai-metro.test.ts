import assert from "node:assert/strict";
import test from "node:test";
import { METRO_STATIONS, metroLine, nearestStation } from "../lib/dubai-metro.ts";

test("nearest metro: the station itself, a walkable estimate, and the honest no-metro line", () => {
  const bay = METRO_STATIONS.find((station) => station.name === "Business Bay")!;
  const near = nearestStation(bay.lat, bay.lng)!;
  assert.equal(near.station.name, "Business Bay");
  assert.equal(near.walkable, true);
  assert.match(metroLine(bay.lat + 0.004, bay.lng)!, /^Nearest metro: Business Bay, ≈ \d+ min walk \(estimate\)$/);
  // Al Qudra, deep in the desert: nothing to walk to.
  assert.equal(metroLine(24.83, 55.37), "No metro within walking distance, drive or taxi");
  assert.equal(nearestStation(null, 55.2), null);
  assert.ok(METRO_STATIONS.length >= 50);
});
