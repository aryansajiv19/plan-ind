"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { categoryFamily } from "@/lib/spots/match";
import { minimumAgeForCategory } from "@/lib/age-policy";
import { listableToday } from "@/lib/venue-facts";

// P25: the real places a category's deal draws from, as the composer's deck.
export type DeckPlace = {
  id: string;
  name: string;
  area: string;
  category: string;
  min_spend: number;
  photo_url: string | null;
  photo_attribution: string | null;
  minimum_age: number | null;
};
export type DeckState = { state: "loading" } | { state: "failed" } | { state: "ready"; places: DeckPlace[] };

const COLUMNS = "id, name, area, category, min_spend, photo_url, photo_attribution, minimum_age";
// One read per family for the life of the page: switching Dinner to Cafes
// and back costs nothing. A failed read is dropped so the next visit retries.
const cache = new Map<string, Promise<DeckPlace[] | null>>();

function readFamily(family: string[]): Promise<DeckPlace[] | null> {
  const key = family.join(",");
  let read = cache.get(key);
  if (!read) {
    read = Promise.resolve(
      listableToday(getSupabase().from("spots").select(COLUMNS).eq("source", "curated").in("category", family))
        // Photographed places first: they carry the deck.
        .order("photo_url", { nullsFirst: false }).order("name").limit(24),
    ).then(({ data, error }) => (error ? null : (data as DeckPlace[])));
    cache.set(key, read);
    void read.then((rows) => { if (!rows) cache.delete(key); });
  }
  return read;
}

export function useDeckPlaces(category: string, age: number, enabled: boolean): DeckState {
  const family = categoryFamily(category);
  const key = family.join(",");
  const [loaded, setLoaded] = useState<{ key: string; places: DeckPlace[] | null } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void readFamily(family).then((places) => { if (live) setLoaded({ key, places }); });
    return () => { live = false; };
    // `family` is derived from `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  if (!enabled || loaded?.key !== key) return { state: "loading" };
  if (!loaded.places) return { state: "failed" };
  // The age gate every other deal path applies, and the picked type first.
  const places = loaded.places
    .filter((place) => age >= Math.max(minimumAgeForCategory(place.category), place.minimum_age ?? 0))
    .sort((a, b) => Number(b.category === category) - Number(a.category === category));
  return { state: "ready", places };
}
