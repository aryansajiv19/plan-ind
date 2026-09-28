import assert from "node:assert/strict";
import test from "node:test";
import { friendStats, visitStats, type StatVisit } from "../components/demo/demoStats.ts";

const visit = (id: string, date: string, district: string, score: number, withIds: string[] = []): StatVisit =>
  ({ id, placeName: id, date, district, score, with: withIds });

test("the counts are the visits' own: places, year, average", () => {
  const stats = visitStats([visit("a", "2026-08-02", "Downtown", 4.8), visit("b", "2026-07-27", "Al Quoz", 4.6), visit("c", "2025-12-30", "Al Quoz", 4.5)]);
  assert.equal(stats.places, 3);
  assert.equal(stats.year, "2026");
  assert.equal(stats.inYear, 2);
  assert.equal(stats.average, 4.6);
});

test("the area bars add up to the visits, and a tie crowns no area", () => {
  const tied = visitStats([visit("a", "2026-07-01", "Jumeirah", 4), visit("b", "2026-07-02", "Al Quoz", 4)]);
  assert.deepEqual(tied.areas.map((a) => [a.name, a.count, a.share]), [["Al Quoz", 1, 50], ["Jumeirah", 1, 50]]);
  assert.equal(tied.topArea, null);
  const led = visitStats([visit("a", "2026-07-01", "Jumeirah", 4), visit("b", "2026-07-02", "Jumeirah", 4), visit("c", "2026-07-03", "Al Quoz", 4)]);
  assert.equal(led.topArea?.name, "Jumeirah");
  assert.equal(led.topArea?.share, 67);
});

test("the period is the month the visits are in, or the span", () => {
  assert.equal(visitStats([visit("a", "2026-07-06", "x", 4), visit("b", "2026-07-27", "x", 4)]).period, "July");
  assert.equal(visitStats([visit("a", "2026-07-06", "x", 4), visit("b", "2026-08-02", "x", 4)]).period, "July to August");
  assert.equal(visitStats([]).period, null);
});

test("outings with a friend and where they last went come from the same visits", () => {
  const visits = [visit("Ninive", "2026-08-02", "x", 4, ["sara"]), visit("Drift", "2026-07-19", "x", 4, ["sara", "maya"])];
  assert.deepEqual(friendStats(visits, "sara"), { outings: 2, last: "Ninive" });
  assert.deepEqual(friendStats(visits, "maya"), { outings: 1, last: "Drift" });
  assert.deepEqual(friendStats(visits, "omar"), { outings: 0, last: null });
});
