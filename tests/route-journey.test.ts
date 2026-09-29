import { test } from "node:test";
import assert from "node:assert/strict";
import { journey, metroRides } from "@/lib/route-journey";

const MARINA = { latitude: 25.0805, longitude: 55.1403 };
const DEIRA = { latitude: 25.2525, longitude: 55.3336 }; // near Deira City Centre
const BURJUMAN_AREA = { latitude: 25.2539, longitude: 55.3036 };

test("one line: a single ride through every station in between, in order", () => {
  const rides = metroRides("Business Bay", "Union")!;
  assert.equal(rides.length, 1);
  assert.equal(rides[0].color, "Red");
  assert.equal(rides[0].stations[0].name, "Business Bay");
  assert.equal(rides[0].stations.at(-1)!.name, "Union");
  assert.ok(rides[0].stations.some((s) => s.name === "World Trade Centre"));
});

test("Red to Green changes line once, at an interchange", () => {
  const rides = metroRides("Business Bay", "Al Ras")!;
  assert.equal(rides.length, 2);
  assert.deepEqual(rides.map((r) => r.color), ["Red", "Green"]);
  assert.ok(["Union", "BurJuman"].includes(rides[1].stations[0].name));
});

test("Route 2020 into the main Red Line is one ride, not a change", () => {
  const rides = metroRides("Al Furjan", "DMCC")!;
  assert.equal(rides.length, 1);
});

test("transit: walk, ride(s), walk, with the station names in the notes", () => {
  const j = journey(MARINA, { latitude: BURJUMAN_AREA.latitude, longitude: BURJUMAN_AREA.longitude }, "TRANSIT")!;
  assert.equal(j.drawn, "TRANSIT");
  assert.equal(j.legs[0].kind, "walk");
  assert.equal(j.legs.at(-1)!.kind, "walk");
  assert.match(j.legs[1].note, /^Board the Red Line at /);
  assert.match(j.legs.at(-1)!.note, /^Get off at /);
  assert.match(j.summary, /estimate/);
});

test("transit with no station in walking range falls back to a drive and says why", () => {
  const desert = { latitude: 24.845, longitude: 55.346 };
  const j = journey(DEIRA, desert, "TRANSIT")!;
  assert.equal(j.drawn, "DRIVING");
  assert.match(j.legs[0].note, /taxi/);
});

test("driving ends on the venue's parking line, or a drop-off when unknown", () => {
  assert.equal(journey(MARINA, { ...DEIRA, parking: "Valet at the entrance" }, "DRIVING")!.legs.at(-1)!.note, "Park: Valet at the entrance");
  assert.equal(journey(MARINA, DEIRA, "DRIVING")!.legs.at(-1)!.note, "Drop off at the entrance");
});

test("no coordinates, no journey", () => {
  assert.equal(journey(MARINA, { latitude: null, longitude: null }, "TRANSIT"), null);
});
