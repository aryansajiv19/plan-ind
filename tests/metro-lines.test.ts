import { test } from "node:test";
import assert from "node:assert/strict";
import { METRO_LINES } from "../lib/metro-lines.ts";
import { METRO_STATIONS } from "../lib/dubai-metro.ts";

test("every metro station is on a drawn line, and every drawn name exists", () => {
  const drawn = new Set(METRO_LINES.flatMap((line) => line.stations.map((station) => station.name)));
  assert.deepEqual(METRO_STATIONS.filter((station) => !drawn.has(station.name)).map((s) => s.name), []);
  assert.equal(METRO_LINES.find((l) => l.key === "red")!.stations.length, 29);
  assert.equal(METRO_LINES.find((l) => l.key === "green")!.stations.length, 20);
});

test("consecutive stations on a line are close (the order is the running order, not alphabetical)", () => {
  for (const line of METRO_LINES) {
    for (let i = 1; i < line.stations.length; i++) {
      const a = line.stations[i - 1], b = line.stations[i];
      const km = Math.hypot((a.lat - b.lat) * 111, (a.lng - b.lng) * 101);
      assert.ok(km < 6.5, `${line.key}: ${a.name} → ${b.name} is ${km.toFixed(1)} km`);
    }
  }
});
