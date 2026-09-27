import assert from "node:assert/strict";
import test from "node:test";
import { METRO_STATIONS, metroLine, nearestStation } from "../lib/dubai-metro.ts";

test("nearest metro: the station itself, a walkable estimate, and the honest no-metro line", () => {
  const bay = METRO_STATIONS.find((station) => station.name === "Business Bay")!;
  const near = nearestStation(bay.lat, bay.lng)!;
  assert.equal(near.station.name, "Business Bay");
  assert.equal(near.walkable, true);
  assert.match(metroLine({ latitude: bay.lat + 0.004, longitude: bay.lng })!, /^Nearest metro: Business Bay, ≈ \d+ min walk \(estimate\)$/);
  // Al Qudra, deep in the desert: nothing to walk to.
  assert.equal(metroLine({ latitude: 24.83, longitude: 55.37 }), "No metro within walking distance, drive or taxi");
  assert.equal(nearestStation(null, 55.2), null);
  assert.ok(METRO_STATIONS.length >= 50);
});

test("070's checked columns win over the computed station when present", () => {
  assert.equal(metroLine({ latitude: 24.83, longitude: 55.37, nearest_station: "Jumeirah Lakes Towers", station_walk_min: 6 }), "Nearest metro: Jumeirah Lakes Towers, ≈ 6 min walk (estimate)");
  assert.equal(metroLine({ latitude: null, longitude: null, nearest_station: "Centrepoint", station_walk_min: null }), "No metro within walking distance, drive or taxi");
});
