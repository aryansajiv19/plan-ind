"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { listableToday } from "@/lib/venue-facts";
import { minimumAgeForCategory } from "@/lib/age-policy";
import { suggestFromVisits, topCategories, type Suggestion } from "@/lib/suggestions";
import type { ProfileVisit, Spot } from "@/lib/types";

const COLUMNS = "id, name, category, area, cuisine, price_band, min_spend, open_till, vibe, photo_url, photo_attribution, description, minimum_age, google_place_id, source";

/**
 * Discover's "because you went to X": one read of places in the account's
 * top categories (the same visibility, closure and age gates as the grid),
 * scored by lib/suggestions.ts. A failed read shows no section, which claims
 * nothing, so it isn't reported.
 */
export function useSuggestions(visits: ProfileVisit[], age: number, enabled: boolean) {
  const categories = useMemo(() => topCategories(visits), [visits]);
  const key = categories.join("|");
  const [read, setRead] = useState<{ key: string; rows: Spot[] } | null>(null);
  // Discover opens and closes with the tab; the same categories aren't re-read.
  const fetched = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !key || fetched.current === key) return;
    let cancelled = false;
    listableToday(getSupabase().from("spots").select(COLUMNS))
      .in("category", key.split("|"))
      .order("name")
      .limit(200)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error) fetched.current = key; // a failed read is retried on the next open
        setRead({ key, rows: error ? [] : (data ?? []) as Spot[] });
      });
    return () => { cancelled = true; };
  }, [enabled, key]);

  const current = read?.key === key ? read : null;
  const suggestions: Suggestion<Spot>[] = useMemo(() => current
    ? suggestFromVisits(visits, current.rows.filter((spot) => age >= Math.max(minimumAgeForCategory(spot.category), spot.minimum_age ?? 0)))
    : [], [current, visits, age]);
  return { suggestions };
}
