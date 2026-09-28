import test from "node:test";
import assert from "node:assert/strict";
import { metroEstimate, routeSteps } from "@/lib/route-steps";
import { METRO_STATIONS } from "@/lib/dubai-metro";

const station = (name: string) => {
  const s = METRO_STATIONS.find((x) => x.name === name)!;
  return { latitude: s.lat, longitude: s.lng };
};

test("transit folds walking steps and reads each ride as line, stops, from → to", () => {
  const steps = routeSteps([
    { travelMode: "WALK", staticDurationMillis: 120_000 },
    { travelMode: "WALK", staticDurationMillis: 240_000 },
    { travelMode: "TRANSIT", transitDetails: { stopCount: 4, transitLine: { nameShort: "Red Line" }, departureStop: { name: "Business Bay" }, arrivalStop: { name: "Mall of the Emirates" } } },
    { travelMode: "WALK", staticDurationMillis: 300_000 },
  ], "TRANSIT");
  assert.deepEqual(steps, ["Walk 6 min", "Red Line, 4 stops: Business Bay → Mall of the Emirates", "Walk 5 min"]);
});

test("driving keeps Google's instructions and drops empty ones", () => {
  assert.deepEqual(routeSteps([{ instructions: "Head north" }, { instructions: " " }, { instructions: "Turn right onto Sheikh Zayed Rd" }], "DRIVING"),
    ["Head north", "Turn right onto Sheikh Zayed Rd"]);
});

test("the metro fallback: same line rides straight, across lines changes, too far says nothing", () => {
  const same = metroEstimate(station("Business Bay"), station("Mall of the Emirates"));
  assert.equal(same?.steps[1], "Red line to Mall of the Emirates");
  assert.ok(same?.driveMin && same.driveMin > 0);
  const green = METRO_STATIONS.find((s) => s.lines.length === 1 && s.lines[0] === "Green")!;
  const across = metroEstimate(station("Business Bay"), { latitude: green.lat, longitude: green.lng });
  assert.match(across!.steps[1], /changing at Union or BurJuman/);
  // Al Qudra is nowhere near a station: no metro steps, the drive estimate stays.
  const desert = metroEstimate(station("Business Bay"), { latitude: 24.83, longitude: 55.38 });
  assert.deepEqual(desert?.steps, []);
  assert.equal(metroEstimate(null, station("Union")), null);
});
