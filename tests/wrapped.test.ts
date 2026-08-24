import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateWrappedSummary,
  dubaiMonthWindow,
  type WrappedRatingRow,
  type WrappedVisitRow,
} from "../lib/wrapped.ts";

function visit(
  planId: string | null,
  spotId: string,
  name: string,
  area = "Dubai Marina",
  category = "Dinner",
  groupLabel: string | null = "Friends",
): WrappedVisitRow {
  return {
    plan_id: planId,
    spot_id: spotId,
    group_label: groupLabel,
    spot: { id: spotId, name, area, category },
  };
}

function rating(planId: string, spotId: string, stars: number): WrappedRatingRow {
  return { plan_id: planId, spot_id: spotId, stars };
}

function summary(
  visits: WrappedVisitRow[],
  ratings: WrappedRatingRow[] = [],
  planCount = 0,
) {
  return aggregateWrappedSummary({
    periodLabel: "August 2026",
    planCount,
    visits,
    ratings,
  });
}

test("Dubai month windows use local midnight across UTC month boundaries", () => {
  assert.deepEqual(dubaiMonthWindow(new Date("2026-08-31T19:59:59.999Z")), {
    start: "2026-07-31T20:00:00.000Z",
    end: "2026-08-31T20:00:00.000Z",
    periodLabel: "August 2026",
  });
  assert.deepEqual(dubaiMonthWindow(new Date("2026-08-31T20:00:00.000Z")), {
    start: "2026-08-31T20:00:00.000Z",
    end: "2026-09-30T20:00:00.000Z",
    periodLabel: "September 2026",
  });
});

test("Dubai month windows cross the UTC year boundary correctly", () => {
  assert.deepEqual(dubaiMonthWindow(new Date("2026-12-31T20:00:00.000Z")), {
    start: "2026-12-31T20:00:00.000Z",
    end: "2027-01-31T20:00:00.000Z",
    periodLabel: "January 2027",
  });
});

test("empty and plans-only inputs keep unavailable visit statistics honest", () => {
  assert.deepEqual(summary([]), {
    periodLabel: "August 2026",
    planCount: 0,
    activityCount: 0,
    topArea: null,
    topGroup: null,
    topCategory: null,
    bestRatedPlace: null,
  });
  assert.deepEqual(summary([], [], 3), {
    periodLabel: "August 2026",
    planCount: 3,
    activityCount: 0,
    topArea: null,
    topGroup: null,
    topCategory: null,
    bestRatedPlace: null,
  });
});

test("area, group, and category modes case-fold values and break count ties by label", () => {
  const result = summary([
    visit("p1", "s1", "One", "marina", "DINNER", "Crew"),
    visit("p2", "s2", "Two", "MARINA", "dinner", "crew"),
    visit("p3", "s3", "Three", "Al Barsha", "Cycling", "Family"),
    visit("p4", "s4", "Four", "al barsha", "cycling", "family"),
    visit("p5", "s5", "Five", "  ", "", null),
  ]);

  assert.equal(result.topArea, "al barsha");
  assert.equal(result.topGroup, "crew");
  assert.equal(result.topCategory, "cycling");
  assert.equal(result.activityCount, 5);
});

test("ratings count only when their exact plan and spot pair was visited", () => {
  const result = summary(
    [
      visit("plan-a", "spot-a", "Eligible"),
      visit("plan-b", "spot-b", "Also eligible"),
      visit(null, "spot-c", "Missing plan"),
    ],
    [
      rating("plan-a", "spot-a", 4),
      rating("another-plan", "spot-a", 5),
      rating("plan-a", "spot-b", 5),
      rating("plan-c", "spot-c", 5),
    ],
  );

  assert.deepEqual(result.bestRatedPlace, {
    name: "Eligible",
    average: 4,
    ratingCount: 1,
  });
});

test("best-rated ranking uses average, then count, then name", () => {
  const averageWinner = summary(
    [visit("p1", "a", "Average winner"), visit("p2", "b", "Popular")],
    [rating("p1", "a", 5), rating("p2", "b", 4), rating("p2", "b", 5)],
  );
  assert.deepEqual(averageWinner.bestRatedPlace, {
    name: "Average winner",
    average: 5,
    ratingCount: 1,
  });

  const countWinner = summary(
    [visit("p1", "a", "One rating"), visit("p2", "b", "Two ratings")],
    [rating("p1", "a", 4), rating("p2", "b", 3), rating("p2", "b", 5)],
  );
  assert.deepEqual(countWinner.bestRatedPlace, {
    name: "Two ratings",
    average: 4,
    ratingCount: 2,
  });

  const nameWinner = summary(
    [visit("p1", "a", "Alpha"), visit("p2", "b", "Beta")],
    [rating("p1", "a", 4), rating("p2", "b", 4)],
  );
  assert.deepEqual(nameWinner.bestRatedPlace, {
    name: "Alpha",
    average: 4,
    ratingCount: 1,
  });
});

test("spot id is the final stable ranking key when names collate equally", () => {
  const decomposedName = "e\u0301";
  const result = summary(
    [visit("p1", "spot-z", "\u00e9"), visit("p2", "spot-a", decomposedName)],
    [rating("p1", "spot-z", 4), rating("p2", "spot-a", 4)],
  );

  assert.equal(result.bestRatedPlace?.name, decomposedName);
});

test("aggregation is deterministic when visit and rating input order is shuffled", () => {
  const visits = [
    visit("p1", "s1", "Beta", "Marina", "Dinner", "Crew"),
    visit("p2", "s2", "Alpha", "marina", "dinner", "crew"),
    visit("p3", "s3", "Gamma", "Jumeirah", "Cycling", "Family"),
  ];
  const ratings = [
    rating("p1", "s1", 5),
    rating("p1", "s1", 3),
    rating("p2", "s2", 4),
    rating("p2", "s2", 4),
  ];

  const expected = summary(visits, ratings, 2);
  assert.deepEqual(summary([...visits].reverse(), [...ratings].reverse(), 2), expected);
  assert.deepEqual(summary([visits[1], visits[2], visits[0]], [ratings[2], ratings[0], ratings[3], ratings[1]], 2), expected);
});
