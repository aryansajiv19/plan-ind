import type { WrappedSummary } from "./types";

const DUBAI_TIME_ZONE = "Asia/Dubai";
const DUBAI_UTC_OFFSET_MS = 4 * 60 * 60 * 1000;

export interface WrappedMonthWindow {
  start: string;
  end: string;
  periodLabel: string;
}

export interface WrappedVisitRow {
  plan_id: string | null;
  spot_id: string;
  group_label: string | null;
  spot: {
    id: string;
    name: string;
    area: string;
    category: string;
  } | null;
}

export interface WrappedRatingRow {
  plan_id: string;
  spot_id: string;
  stars: number;
}

/**
 * Inclusive start / exclusive end for the calendar month containing `now` in
 * Dubai. Dubai is UTC+04:00 year-round, so the UTC boundaries are explicit
 * and do not inherit the server's local timezone.
 */
export function dubaiMonthWindow(now: Date): WrappedMonthWindow {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DUBAI_TIME_ZONE,
    year: "numeric",
    month: "numeric",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const startMs = Date.UTC(year, month - 1, 1) - DUBAI_UTC_OFFSET_MS;
  const endMs = Date.UTC(year, month, 1) - DUBAI_UTC_OFFSET_MS;

  return {
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
    periodLabel: new Intl.DateTimeFormat("en-US", {
      timeZone: DUBAI_TIME_ZONE,
      month: "long",
      year: "numeric",
    }).format(now),
  };
}

function compareLabels(a: string, b: string): number {
  return a.localeCompare(b, "en", { sensitivity: "base" })
    || a.localeCompare(b, "en");
}

function mostCommon(labels: Array<string | null | undefined>): string | null {
  const counts = new Map<string, { label: string; count: number }>();
  for (const rawLabel of labels) {
    const label = rawLabel?.trim();
    if (!label) continue;
    const key = label.toLocaleLowerCase("en-US");
    const current = counts.get(key);
    if (current) {
      current.count += 1;
      if (compareLabels(label, current.label) < 0) current.label = label;
    } else {
      counts.set(key, { label, count: 1 });
    }
  }

  return [...counts.values()].sort(
    (a, b) => b.count - a.count || compareLabels(a.label, b.label),
  )[0]?.label ?? null;
}

/** Pure aggregation seam for deterministic focused tests. */
export function aggregateWrappedSummary(input: {
  periodLabel: string;
  planCount: number;
  visits: WrappedVisitRow[];
  ratings: WrappedRatingRow[];
}): WrappedSummary {
  const visitPairs = new Set(
    input.visits
      .filter((visit) => visit.plan_id !== null)
      .map((visit) => `${visit.plan_id}:${visit.spot_id}`),
  );
  const spotNames = new Map(
    input.visits.flatMap((visit) =>
      visit.spot ? [[visit.spot_id, visit.spot.name] as const] : [],
    ),
  );
  const ratingTallies = new Map<string, { sum: number; count: number }>();

  for (const rating of input.ratings) {
    if (!visitPairs.has(`${rating.plan_id}:${rating.spot_id}`)) continue;
    const current = ratingTallies.get(rating.spot_id) ?? { sum: 0, count: 0 };
    current.sum += rating.stars;
    current.count += 1;
    ratingTallies.set(rating.spot_id, current);
  }

  const best = [...ratingTallies.entries()]
    .filter(([spotId]) => spotNames.has(spotId))
    .sort(([spotA, a], [spotB, b]) =>
      b.sum * a.count - a.sum * b.count
      || b.count - a.count
      || compareLabels(spotNames.get(spotA) ?? "", spotNames.get(spotB) ?? "")
      || spotA.localeCompare(spotB),
    )[0];

  return {
    periodLabel: input.periodLabel,
    planCount: input.planCount,
    activityCount: input.visits.length,
    topArea: mostCommon(input.visits.map((visit) => visit.spot?.area)),
    topGroup: mostCommon(input.visits.map((visit) => visit.group_label)),
    topCategory: mostCommon(input.visits.map((visit) => visit.spot?.category)),
    bestRatedPlace: best
      ? {
          name: spotNames.get(best[0]) as string,
          average: best[1].sum / best[1].count,
          ratingCount: best[1].count,
        }
      : null,
  };
}
