"use client";

import { useEffect, useState } from "react";

// P6: how many places each budget × radius could deal from, for this account,
// before the host submits. Anything but a 200 (signed out, a 503, offline)
// is null: every option stays enabled and nothing is said, as before.
export interface DealPreview {
  counts: { maxBudget: number | null; radii: { radiusKm: number | null; count: number }[] }[];
  /** The most each category could ever offer; null is unknown, not zero. */
  categories: Record<string, number | null>;
}

export function useDealPreview(category: string, origin: string, enabled: boolean) {
  const key = `${category}|${origin}`;
  const [preview, setPreview] = useState<{ key: string; data: DealPreview } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetch(`/api/spots/deal/preview?${new URLSearchParams({ category, origin })}`, { signal: controller.signal, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: DealPreview | null) => {
        if (data && Array.isArray(data.counts) && data.categories) setPreview({ key: `${category}|${origin}`, data });
      })
      .catch(() => { /* aborted or offline: no counts */ });
    return () => controller.abort();
  }, [category, origin, enabled]);

  // A stale answer for another category or origin is no answer.
  const data = enabled && preview?.key === key ? preview.data : null;
  return {
    /** Eligible places for one budget and radius, or null when unknown. */
    count(maxBudget: number | null, radiusKm: number | null): number | null {
      return data?.counts.find((row) => row.maxBudget === maxBudget)?.radii.find((cell) => cell.radiusKm === radiusKm)?.count ?? null;
    },
    /** False only when the server says this category can never fill nine. */
    canFill(categoryKey: string): boolean {
      const most = data?.categories[categoryKey];
      return most == null || most >= 9;
    },
  };
}
