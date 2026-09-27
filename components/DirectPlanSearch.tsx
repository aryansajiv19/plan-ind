"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { minimumAgeForCategory } from "@/lib/age-policy";
import DirectPlanForm, { type DirectPlanSpot } from "@/components/DirectPlanForm";

type Row = DirectPlanSpot & { minimum_age: number | null };

/**
 * StartPlanForm's "I already know where" door: search the curated catalogue,
 * pick one spot, hand off to DirectPlanForm (the same component the place
 * page's CTA uses, so both doors converge on one creation call).
 */
export default function DirectPlanSearch({ age }: { age: number }) {
  const [spotQuery, setSpotQuery] = useState("");
  const [spotResults, setSpotResults] = useState<DirectPlanSpot[]>([]);
  const [spotSearching, setSpotSearching] = useState(false);
  const [hasSearchedSpots, setHasSearchedSpots] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [pickedSpot, setPickedSpot] = useState<DirectPlanSpot | null>(null);

  // Same age gate every other path here enforces: a match the account can't
  // actually use shouldn't be offered as if it could.
  const usable = (rows: Row[] | null) =>
    (rows ?? []).filter((spot) => age >= Math.max(minimumAgeForCategory(spot.category), spot.minimum_age ?? 0));

  // P12: the catalogue as tiles before anything is typed, so the door opens
  // onto places rather than an empty box.
  useEffect(() => {
    let active = true;
    void getSupabase().from("spots").select("id,name,area,category,minimum_age").eq("source", "curated")
      .order("name").limit(12)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setSearchFailed(true);
        else setSpotResults(usable(data as Row[]));
      });
    return () => { active = false; };
    // Once, on open: the age gate is fixed for the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Explicit search-on-submit, not live-as-you-type: one deliberate query
  // beats a request per keystroke against a table with no search index.
  async function searchSpots(event: React.FormEvent) {
    event.preventDefault();
    // Name, area or cuisine (P12). Characters that would change PostgREST's
    // or() filter or the ilike pattern are dropped, so the query is only text.
    const query = spotQuery.replace(/[,()*%_\\:."']/g, " ").trim();
    if (query.length < 2) return;
    setSpotSearching(true);
    setSearchFailed(false);
    const { data, error } = await getSupabase()
      .from("spots")
      .select("id,name,area,category,minimum_age")
      .eq("source", "curated")
      .or(`name.ilike.%${query}%,area.ilike.%${query}%,cuisine.ilike.%${query}%`)
      .order("name")
      .limit(12);
    setSpotSearching(false);
    setHasSearchedSpots(true);
    if (error) { setSearchFailed(true); setSpotResults([]); return; }
    setSpotResults(usable(data as Row[]));
  }

  if (pickedSpot) return <DirectPlanForm spot={pickedSpot} onCancel={() => setPickedSpot(null)} />;

  return (
    <form onSubmit={searchSpots} className="plan-spot-search" aria-labelledby="spot-search-heading">
      <label htmlFor="spot-search-input" className="plan-form__label" id="spot-search-heading">
        Search the catalogue
      </label>
      <div className="plan-spot-search__field">
        <input
          id="spot-search-input"
          value={spotQuery}
          onChange={(event) => { setSpotQuery(event.target.value); setHasSearchedSpots(false); }}
          placeholder="A place, an area or a cuisine"
          maxLength={80}
        />
        <button type="submit" disabled={spotSearching || spotQuery.trim().length < 2}>
          {spotSearching ? "Searching…" : "Search"}
        </button>
      </div>
      {spotResults.length > 0 && (
        <div className="plan-spot-search__results">
          {spotResults.map((spot) => (
            <button key={spot.id} type="button" onClick={() => setPickedSpot(spot)}>
              <strong>{spot.name}</strong>
              <span>{spot.area}</span>
            </button>
          ))}
        </div>
      )}
      {searchFailed && (
        <p className="plan-spot-search__empty" role="alert">The catalogue didn’t load. Check your connection and search again.</p>
      )}
      {!spotSearching && !searchFailed && hasSearchedSpots && spotResults.length === 0 && (
        <p className="plan-spot-search__empty">No matches yet. Try a different spelling, an area or a cuisine.</p>
      )}
    </form>
  );
}
