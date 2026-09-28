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
