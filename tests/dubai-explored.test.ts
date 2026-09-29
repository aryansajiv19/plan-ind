import { test } from "node:test";
import assert from "node:assert/strict";
import { DISTRICTS, ICONS, districtFor, dubaiExplored } from "@/lib/dubai-explored";
import { coordinatesForArea } from "@/lib/dubai-areas";

test("hotel and mall 'areas' land in the district people would name", () => {
  assert.equal(districtFor("Atlantis"), "The Palm");
  assert.equal(districtFor("emirates towers "), "Downtown & DIFC");
  assert.equal(districtFor("JW Marriott Marquis"), "Business Bay", "split from Downtown");
  assert.equal(districtFor("Dubai Festival City"), "Festival City & Garhoud");
  assert.equal(districtFor("Al Warqa"), "Mirdif & Al Warqa", "moved out of Desert & beyond");
  assert.equal(districtFor("Somewhere new"), null);
  assert.equal(districtFor(null), null);
});

test("no area belongs to two districts, and every district has an area the catalogue can snap to", () => {
  const all = DISTRICTS.flatMap((d) => d.areas.map((a) => a.toLowerCase()));
  assert.equal(new Set(all).size, all.length);
  assert.equal(DISTRICTS.length, 17);
  for (const d of DISTRICTS) assert.ok(d.areas.some((a) => coordinatesForArea(a)), `${d.name} has an area with a centre`);
});

test("explored counts distinct places and districts, ticks icons, and nudges to the richest unvisited district", () => {
  const catalogue = [
    { id: "a", area: "JBR" },
    { id: "b", area: "Dubai Marina" },
    { id: "c", area: "Al Quoz" },
    { id: "d", area: "Al Quoz" },
    { id: ICONS[0].spotId, area: "Trade Centre" },
  ];
  const visited = [catalogue[0], catalogue[0], catalogue[4], null]; // a repeat visit, an icon, a deleted spot
  const r = dubaiExplored(visited, catalogue);

  const marina = r.districts.find((d) => d.name === "Marina & JBR")!;
  assert.deepEqual([marina.been, marina.total], [1, 2]);
  assert.equal(r.districtsBeen, 2);
  assert.equal(r.percent, 12, "2 of 17 districts");
  assert.equal(r.iconsDone, 1);
  assert.equal(r.next?.name, "Al Quoz & Alserkal");
});

test("nothing visited: 0%, no icons, and still a next district to try", () => {
  const r = dubaiExplored([], [{ id: "x", area: "Hatta" }]);
  assert.deepEqual([r.percent, r.iconsDone, r.next?.name], [0, 0, "Desert & beyond"]);
});
