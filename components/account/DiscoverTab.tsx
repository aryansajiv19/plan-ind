"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PlaceLinkImporter from "@/components/PlaceLinkImporter";
import FoldersSection from "@/components/account/FoldersSection";
import type { useSuggestions } from "@/hooks/use-suggestions";
import PlaceCard from "@/components/account/PlaceCard";
import ExploreConstellation from "@/components/account/ExploreConstellation";
import MoodboardsSection from "@/components/account/MoodboardsSection";
import type { MoodboardsState } from "@/components/account/useMoodboards";
import { placePlanPrefill, type PlanPrefill } from "@/lib/board-plan";
import { CATEGORIES } from "@/components/categoryGroups";
import { categoryLabel } from "@/lib/categories";
import { minimumAgeForCategory } from "@/lib/age-policy";
import { listableToday } from "@/lib/venue-facts";
import { getSupabase } from "@/lib/supabase";
import useDebounce from "@/hooks/use-debounce";
import type { Spot } from "@/lib/types";

// Called from AccountViews, not DiscoverTab: AccountViews stays mounted
// across a tab switch, so a search typed here survives a trip to another tab.
export function useDiscoverSearch(spots: Spot[], age: number) {
  const [query, setQuery] = useState("");
  const [placeFilter, setPlaceFilter] = useState("All");

  // One gate, applied to both paths. The Discover grid was the only
  // catalogue surface with none — StartPlanForm and ActionSearchBar both
  // apply this, and a new query should not ship weaker than its siblings.
  const allowed = useMemo(
    () => (rows: Spot[]) =>
      rows.filter((spot) => age >= Math.max(minimumAgeForCategory(spot.category), spot.minimum_age ?? 0)),
    [age],
  );

  // Derived from the rows we have, which is the first 120 by name — so a
  // category whose only venues sort late has no tab. Correcting that needs
  // a DISTINCT over the whole table, which PostgREST cannot express and
  // which belongs in an RPC (backend-data). Left deriving from data rather
  // than switched to lib/categories' full list of 23, because that would
  // render tabs that match nothing — a dead control, which is the worse of
  // the two bugs. Flagged rather than papered over.
  const categories = useMemo(() => {
    const found = new Set(allowed(spots).map((spot) => spot.category));
    return ["All", ...[...found].sort()];
  }, [spots, allowed]);

  // The catalogue is not all here. The page sends the first 120 rows by
  // name, and even without that limit PostgREST caps a read at 1000 — so
  // filtering the prop in memory is a search that silently stops finding
  // things as the catalogue grows, and raising the number cannot fix it.
  // Browsing still uses the prop, because "the first 120 by name" is
  // exactly what an unfiltered grid shows anyway; a real query goes to the
  // server. Same shape as ActionSearchBar, deliberately: one way to search
  // the catalogue, not two that drift.
  const searching = query.trim().length > 0 || placeFilter !== "All";
  const debouncedQuery = useDebounce(query.trim(), 200);
  const remoteKey = `${debouncedQuery}\u0000${placeFilter}`;
  // Results carry the key they belong to, so a stale response is recognised
  // during render rather than cleared from an effect — the React 19
  // setState-in-effect trap this repo has hit twice.
  const [remote, setRemote] = useState<{ key: string; rows: Spot[]; failed: boolean } | null>(null);

  useEffect(() => {
    const q = debouncedQuery;
    const filter = placeFilter;
    if (!q && filter === "All") return;
    let cancelled = false;
    let request = listableToday(getSupabase()
      .from("spots")
      // Every spot this account may read (RLS: curated, community, its own),
      // as the grid shows, not only curated (P13), less 070's closed ones.
      .select("id, name, category, area, cuisine, price_band, min_spend, open_till, vibe, photo_url, photo_attribution, description, minimum_age, google_place_id, source, latitude, longitude"));
    if (filter !== "All") request = request.eq("category", filter);
    if (q) {
      // Quote the value and escape what the quoting cares about. PostgREST's
      // `or` uses the comma as a clause separator, so an unquoted term
      // containing one produces PGRST100 and a 400 — verified against the
      // live project: "a,b" failed outright, and because the failure comes
      // back as a rejected request rather than an empty match, the grid
      // would just show nothing. Someone searching "beach, dubai" would
      // read that as "no such place". Quoting fixes every hostile term I
      // could construct: commas, parentheses, quotes, apostrophes,
      // backslashes and dots all return 200. Note `%` and `*` in a term
      // still act as wildcards; that is PostgREST's ilike, and harmless.
      const esc = q.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      request = request.or(
        `name.ilike."%${esc}%",area.ilike."%${esc}%",cuisine.ilike."%${esc}%"`,
      );
    }
    request.order("name").limit(200).then(({ data, error }) => {
      if (cancelled) return;
      setRemote({ key: `${q}\u0000${filter}`, rows: (data ?? []) as Spot[], failed: Boolean(error) });
    });
    return () => { cancelled = true; };
  }, [debouncedQuery, placeFilter]);

  const visiblePlaces = useMemo(() => {
    if (!searching) return allowed(spots);
    if (remote?.key === remoteKey) return allowed(remote.rows);
    // Stale or not yet arrived: fall back to filtering what we already have,
    // so the grid narrows immediately instead of blanking on every keystroke.
    const clean = debouncedQuery.toLowerCase();
    return allowed(spots).filter((spot) => {
      const matchesFilter = placeFilter === "All" || spot.category === placeFilter;
      const matchesQuery = !clean
        || `${spot.name} ${spot.area} ${spot.category} ${spot.cuisine}`.toLowerCase().includes(clean);
      return matchesFilter && matchesQuery;
    });
  }, [searching, remote, remoteKey, spots, placeFilter, debouncedQuery, allowed]);

  // The search on screen failed: said as such, never as "no matches" (P13).
  const searchFailed = searching && remote?.key === remoteKey && remote.failed;
  return { query, setQuery, placeFilter, setPlaceFilter, categories, visiblePlaces, searchFailed };
}

export default function DiscoverTab({
  personId,
  suggested,
  spots,
  search,
  boards,
  age,
  onPlanFromBoard,
}: {
  spots: Spot[];
  search: ReturnType<typeof useDiscoverSearch>;
  boards: MoodboardsState;
  age: number;
  onPlanFromBoard: (prefill: PlanPrefill) => void;
  suggested: ReturnType<typeof useSuggestions>;
  personId: string | null;
}) {
  const { query, setQuery, placeFilter, setPlaceFilter, categories, visiblePlaces, searchFailed } = search;
  const [layout, setLayout] = useState<"grid" | "map">("grid");
  const allowedCategory = (category: string) => CATEGORIES.some((c) => c.key === category) && age >= minimumAgeForCategory(category);
  return (
    <section className="demo-view" aria-labelledby="discover-title">
      <header className="demo-view__header">
        <div><h1 id="discover-title">Places worth considering.</h1></div>
        <p>The catalogue a plan deals from. Search it, then start a vote on anything that fits tonight.</p>
      </header>

      {personId && <FoldersSection personId={personId} />}

      {suggested.suggestions.length > 0 && (
        <section className="discover-suggested" aria-labelledby="suggested-title">
          <h2 id="suggested-title">For you</h2>
          <ul>
            {suggested.suggestions.map(({ spot, because }) => (
              <li key={spot.id}>
                <Link href={`/place/${spot.id}`}>{spot.name}</Link>
                <span>{spot.area} · because you went to {because}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <MoodboardsSection boards={boards} age={age} onPlanFromBoard={onPlanFromBoard} />

      <PlaceLinkImporter />

      <div className="demo-discover-tools">
        <label><span>Search places</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Area, place or category" /></label>
        <div className="demo-filter-tabs" aria-label="Filter places">
          {categories.map((filter) => (
            <button key={filter} type="button" onClick={() => setPlaceFilter(filter)} aria-pressed={placeFilter === filter}>{categoryLabel(filter)}</button>
          ))}
        </div>
      </div>

      <div className="explore-toggle" role="group" aria-label="Show places as">
        <button type="button" aria-pressed={layout === "grid"} onClick={() => setLayout("grid")}>Grid</button>
        <button type="button" aria-pressed={layout === "map"} onClick={() => setLayout("map")}>Map</button>
      </div>

      {searchFailed ? (
        <p className="demo-empty" role="alert">Search failed. Check your connection and try again.</p>
      ) : visiblePlaces.length && layout === "map" ? (
        <ExploreConstellation spots={visiblePlaces} />
      ) : visiblePlaces.length ? (
        <div className="demo-place-grid">
          {visiblePlaces.map((spot) => (
            <PlaceCard
              key={spot.id}
              spot={spot}
              // P30: the vote really starts with this place (round 1).
              onStartPlan={() => onPlanFromBoard(placePlanPrefill(spot, allowedCategory, `${spot.id}:${Date.now()}`))}
              boards={boards}
            />
          ))}
        </div>
      ) : (
        <p className="demo-empty">
          {spots.length === 0
            // Not "there are no places": an empty read and a failed one look
            // identical here, so the copy says what the visitor can do next.
            ? "No places to show right now. Add one with its link above, or try again in a moment."
            : "No places match that search."}
        </p>
      )}
    </section>
  );
}
