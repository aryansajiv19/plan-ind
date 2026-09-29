import { test } from "node:test";
import assert from "node:assert/strict";
import { DISTRICTS, ICONS, districtFor, dubaiExplored } from "@/lib/dubai-explored";

test("hotel and mall 'areas' land in the district people would name", () => {
  assert.equal(districtFor("Atlantis"), "The Palm");
  assert.equal(districtFor("emirates towers "), "Downtown & DIFC");
  assert.equal(districtFor("Somewhere new"), null);
  assert.equal(districtFor(null), null);
});

test("no area belongs to two districts", () => {
  const all = DISTRICTS.flatMap((d) => d.areas.map((a) => a.toLowerCase()));
  assert.equal(new Set(all).size, all.length);
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
  assert.equal(r.percent, 20);
  assert.equal(r.iconsDone, 1);
  assert.equal(r.next?.name, "Al Quoz & Alserkal");
});

test("nothing visited: 0%, no icons, and still a next district to try", () => {
  const r = dubaiExplored([], [{ id: "x", area: "Hatta" }]);
  assert.deepEqual([r.percent, r.iconsDone, r.next?.name], [0, 0, "Desert & beyond"]);
});
