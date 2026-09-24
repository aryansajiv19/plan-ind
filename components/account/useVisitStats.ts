import { useMemo } from "react";
import type { ProfileVisit } from "@/lib/types";

export default function useVisitStats(visits: ProfileVisit[]) {
  // Profile figures are counted from the visit log, never stored separately —
  // a stat that can disagree with the thing it counts is worse than no stat.
  const stats = useMemo(() => {
    const rows = visits;
    const areas = new Map<string, number>();
    for (const visit of rows) {
      const area = visit.spot?.area;
      if (area) areas.set(area, (areas.get(area) ?? 0) + 1);
    }
    const ranked = [...areas.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const total = rows.length;
    return {
      total,
      places: new Set(rows.map((visit) => visit.spot_id)).size,
      fromPlans: rows.filter((visit) => visit.plan_id).length,
      areas: ranked.map(([area, count]) => ({
        name: area,
        visits: count,
        share: total ? Math.round((count / total) * 100) : 0,
      })),
    };
  }, [visits]);
  return stats;
}

export type VisitStats = ReturnType<typeof useVisitStats>;
