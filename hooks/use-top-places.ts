"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import type { TopPlace } from "@/lib/types";

export type TopPlacesRead =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; places: TopPlace[] };

/**
 * Discover's "Top places" (085 top_places): the best community scores among
 * curated places, Dubai-wide (area null) or in one area. "ready" with no
 * places means nowhere has five raters yet, which is not a failure; a
 * failed read is "failed". Keyed on its inputs, so switching area never
 * shows the previous area's list.
 */
export function useTopPlaces(area: string | null, limit = 12, enabled = true): TopPlacesRead {
  const inputs = `${area ?? ""}|${limit}`;
  const [read, setRead] = useState<{ inputs: string; value: TopPlacesRead } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void getSupabase()
      .rpc("top_places", { p_area: area, p_limit: limit })
      .then(({ data, error }) => {
        if (cancelled) return;
        setRead({ inputs, value: error ? { status: "failed" } : { status: "ready", places: (data ?? []) as TopPlace[] } });
      });
    return () => { cancelled = true; };
  }, [enabled, inputs, area, limit]);

  return read?.inputs === inputs ? read.value : { status: "loading" };
}
