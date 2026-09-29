import assert from "node:assert/strict";
import test from "node:test";
import { suggestFromVisits, topCategories } from "../lib/suggestions.ts";

const now = new Date("2026-09-28T12:00:00Z");
const place = (id: string, category: string, area: string) => ({ id, name: id, category, area });
const visit = (spot: ReturnType<typeof place>, daysAgo: number) =>
  ({ visited_at: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(), spot });

const buQtair = place("Bu Qtair", "dinner", "Umm Suqeim");
const arrows = place("Arrows & Sparrows", "cafe", "Al Quoz");
const visits = [visit(buQtair, 10), visit(arrows, 200), { visited_at: now.toISOString(), spot: null }];

test("category counts double area, recent visits double again; a category never been to, or a place been to, is left out", () => {
  const out = suggestFromVisits(visits, [
    place("Cafe in Umm Suqeim", "cafe", "Umm Suqeim"),
    place("Dinner in Marina", "dinner", "Marina"),
    place("Dinner in Umm Suqeim", "dinner", "Umm Suqeim"),
    buQtair,
    place("Shisha nowhere near", "shisha", "Deira"),
  ], 6, now);
  assert.deepEqual(out.map((s) => [s.spot.name, s.score]), [
    ["Dinner in Umm Suqeim", 6], // 2x2 category (recent) + 2 area (recent)
    ["Cafe in Umm Suqeim", 4], // 2x1 category (old) + 2 area; ties break by name
    ["Dinner in Marina", 4],
  ]);
});

test("the reason is the most alike visit: same category and area first", () => {
  const out = suggestFromVisits([visit(place("Old dinner", "dinner", "Marina"), 5), visit(buQtair, 20)],
    [place("New dinner", "dinner", "Umm Suqeim")], 6, now);
  assert.equal(out[0].because, "Bu Qtair");
});

test("no visits, no suggestions; top categories by count", () => {
  assert.deepEqual(suggestFromVisits([], [buQtair], 6, now), []);
  assert.deepEqual(topCategories([visit(buQtair, 1), visit(arrows, 1), visit(place("x", "cafe", "y"), 1)]), ["cafe", "dinner"]);
});

test("a loved place leads, a meh one drops out: weighted by how you ranked it", () => {
  const lovedCafe = place("Loved cafe", "cafe", "Jumeirah");
  const mehDinner = place("Meh dinner", "dinner", "Marina");
  const fineDinner = place("Fine dinner", "dinner", "Deira");
  const onlyMehShisha = place("Meh shisha", "shisha", "Deira");
  const history = [visit(lovedCafe, 5), visit(mehDinner, 5), visit(fineDinner, 5), visit(onlyMehShisha, 5)];
  const rankings = [
    { spot_id: lovedCafe.id, bucket: "loved" as const },
    { spot_id: mehDinner.id, bucket: "meh" as const },
    { spot_id: onlyMehShisha.id, bucket: "meh" as const },
  ];
  const candidates = [place("Another cafe", "cafe", "Al Quoz"), place("Another dinner", "dinner", "Al Quoz"), place("Another shisha", "shisha", "Deira")];
  const out = suggestFromVisits(history, candidates, 6, now, rankings);
  assert.deepEqual(out.map((s) => [s.spot.name, s.score]), [
    ["Another cafe", 12], // 2 x (recent 2 x loved 3)
    ["Another dinner", 4], // only the fine one counts: 2 x (recent 2 x 1); the meh one adds nothing
  ], "a category you only found meh (shisha) isn't suggested, even in an area you know");
  assert.equal(out[1].because, "Fine dinner", "the reason is never a place you found meh");
  assert.deepEqual(topCategories(history, 3, rankings), ["cafe", "dinner"]);
});

test("unranked visits count as before, so an empty ranking changes nothing", () => {
  const plain = suggestFromVisits(visits, [place("Dinner in Umm Suqeim", "dinner", "Umm Suqeim")], 6, now);
  assert.deepEqual(suggestFromVisits(visits, [place("Dinner in Umm Suqeim", "dinner", "Umm Suqeim")], 6, now, []), plain);
});
