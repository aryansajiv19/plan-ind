"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import type { PlaceScore } from "@/lib/types";

export type PlaceScoresRead =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; scores: ReadonlyMap<string, PlaceScore> };

/** place_scores takes at most 200 ids a call. */
const MAX_IDS = 200;

/**
 * Community scores (085 place_scores) for the places on screen, in one read.
 * A place missing from `scores` has fewer than five raters: show no chip,
 * not a zero. A failed read is "failed". The ids are a set, so the same
 * places in another order don't read again.
 */
export function usePlaceScores(spotIds: readonly string[], enabled = true): PlaceScoresRead {
  const key = useMemo(() => [...new Set(spotIds)].sort().slice(0, MAX_IDS).join(","), [spotIds]);
  const [read, setRead] = useState<{ key: string; value: PlaceScoresRead } | null>(null);

  useEffect(() => {
    if (!enabled || !key) return;
    let cancelled = false;
    void getSupabase()
      .rpc("place_scores", { p_spot_ids: key.split(",") })
      .then(({ data, error }) => {
        if (cancelled) return;
        const scores = new Map(((data ?? []) as PlaceScore[]).map((row) => [row.spot_id, row]));
        setRead({ key, value: error ? { status: "failed" } : { status: "ready", scores } });
      });
    return () => { cancelled = true; };
  }, [enabled, key]);

  if (!key) return { status: "ready", scores: new Map() };
  return read?.key === key ? read.value : { status: "loading" };
}
