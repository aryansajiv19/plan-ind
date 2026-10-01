"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import type { TopPlace } from "@/lib/types";
import { hasRealPhoto } from "@/lib/venue-photo";

export type TopPlacesRead =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; places: TopPlace[] };

/**
 * Discover's "Top places" (085 top_places): the best community scores among
 * curated places, Dubai-wide (area null) or in one area. "ready" with no
 * places means nowhere has five raters yet, which is not a failure; a
 * failed read is "failed". Keyed on its inputs, so switching area never
 * shows the previous area's list. Only places with a real photo are listed
 * (lib/venue-photo.ts), so it asks for twice the limit and keeps the first.
 */
export function useTopPlaces(area: string | null, limit = 12, enabled = true): TopPlacesRead {
  const inputs = `${area ?? ""}|${limit}`;
  const [read, setRead] = useState<{ inputs: string; value: TopPlacesRead } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void getSupabase()
      .rpc("top_places", { p_area: area, p_limit: limit * 2 })
      .then(({ data, error }) => {
        if (cancelled) return;
        setRead({ inputs, value: error ? { status: "failed" } : { status: "ready", places: ((data ?? []) as TopPlace[]).filter((place) => hasRealPhoto({ ...place, id: place.spot_id })).slice(0, limit) } });
      });
    return () => { cancelled = true; };
  }, [enabled, inputs, area, limit]);

  return read?.inputs === inputs ? read.value : { status: "loading" };
}
