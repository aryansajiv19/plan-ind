"use client";

import { useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { minimumAgeForCategory } from "@/lib/age-policy";
import DirectPlanForm, { type DirectPlanSpot } from "@/components/DirectPlanForm";

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
  const [pickedSpot, setPickedSpot] = useState<DirectPlanSpot | null>(null);

  // Explicit search-on-submit, not live-as-you-type: one deliberate query
  // beats a request per keystroke against a table with no search index.
  async function searchSpots(event: React.FormEvent) {
    event.preventDefault();
    const query = spotQuery.trim();
    if (query.length < 2) return;
    setSpotSearching(true);
    const { data } = await getSupabase()
      .from("spots")
      .select("id,name,area,category,minimum_age")
      .eq("source", "curated")
      .ilike("name", `%${query}%`)
      .order("name")
      .limit(8);
    setSpotSearching(false);
    setHasSearchedSpots(true);
    // Same age gate every other path here already enforces — a match the
    // account can't actually use shouldn't be offered as if it could.
    setSpotResults(
      (data ?? []).filter((spot) => age >= Math.max(minimumAgeForCategory(spot.category), spot.minimum_age ?? 0)),
    );
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
          placeholder="A place you already have in mind"
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
      {!spotSearching && hasSearchedSpots && spotResults.length === 0 && (
        <p className="plan-spot-search__empty">No matches yet. Try a different spelling or a shorter name.</p>
      )}
    </form>
  );
}
