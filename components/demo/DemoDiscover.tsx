"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import PhotoWall from "@/components/PhotoWall";
import VenuePhoto from "@/components/VenuePhoto";
import ExploreConstellation from "@/components/account/ExploreConstellation";
import { MorePlaces, useDiscoverSearch } from "@/components/account/DiscoverTab";
import { categoryLabel } from "@/lib/categories";
import { hasVenuePhoto } from "@/lib/venue-photo";
import type { Spot } from "@/lib/types";

// The demo's Discover: the real catalogue through the signed-in tab's own
// pieces (its search and filters, the Grid/Map toggle, the constellation map),
// laid out as the landing's photo wall; every tile opens the real place page.
// Only Top places is sample: its scores come from members' rankings, which a
// visitor has none of, so fixture scores sit on real places, labelled so.

// HomeExperience's default age, the one the demo's composer and search use.
const DEMO_AGE = 21;

/** A fixed score per place, so the sample board holds still between renders. */
function sampleScore(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { score: 7.8 + (h % 18) / 10, raters: 5 + (h % 23) };
}

/** The landing wall's order: our own photographs, then Google's, then art. */
const photoFirst = (spots: Spot[]) =>
  [...spots].sort((a, b) => Number(!a.photo_url) - Number(!b.photo_url) || Number(!a.google_place_id) - Number(!b.google_place_id));

function SampleTopPlaces({ spots }: { spots: Spot[] }) {
  const [area, setArea] = useState<string | null>(null);
  const areas = useMemo(() => [...new Set(spots.map((s) => s.area))].sort(), [spots]);
  const top = useMemo(() => {
    const here = spots.filter((spot) => !area || spot.area === area);
    // Our own photographs where the area has a few; Google's otherwise.
    const own = here.filter((spot) => spot.photo_url);
    return (own.length >= 3 ? own : here.filter((spot) => hasVenuePhoto(spot)))
      .map((spot) => ({ spot, ...sampleScore(spot.id) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }, [spots, area]);

  return (
    <section className="top-places" aria-labelledby="top-places-title">
      <div className="top-places__head">
        <h2 id="top-places-title">Top places {area ? `in ${area}` : "in Dubai"} · sample</h2>
        <select aria-label="Area" value={area ?? ""} onChange={(e) => setArea(e.target.value || null)}>
          <option value="">All Dubai</option>
          {areas.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      <p className="boards__note">Sample scores on real places. On your own account these are members’ rankings, once five people have ranked a place.</p>
      {top.length === 0 ? (
        <p className="demo-empty">No photographed places in {area} yet. Pick another area.</p>
      ) : (
        <ol className="top-places__list">
          {top.map(({ spot, score, raters }, i) => (
            <li key={spot.id}>
              <Link href={`/place/${spot.id}`} className="top-places__card">
                <span className="top-places__photo">
                  <VenuePhoto spot={spot} sizes="16rem" />
                  <span className="top-places__rank">#{i + 1}</span>
                </span>
                <strong>{spot.name}</strong>
                <span>{spot.area} · <b>{score.toFixed(1)}</b> from {raters} people</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default function DemoDiscover({ spots }: { spots: Spot[] }) {
  const { query, setQuery, placeFilter, setPlaceFilter, categories, visiblePlaces, searchFailed, shown, showMore } = useDiscoverSearch(spots, DEMO_AGE);
  const [layout, setLayout] = useState<"grid" | "map">("grid");

  return (
    <section className="demo-view" aria-labelledby="discover-title">
      <header className="demo-view__header">
        <div><h1 id="discover-title">Places worth considering.</h1></div>
        <p>The catalogue a plan deals from. Search it, then start a vote on anything that fits tonight.</p>
      </header>

      <SampleTopPlaces spots={spots} />

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
      ) : layout === "map" && visiblePlaces.length ? (
        <ExploreConstellation spots={visiblePlaces} />
      ) : (
        <>
        <PhotoWall items={photoFirst(visiblePlaces).slice(0, shown).map((spot) => ({ id: spot.id, kind: "photo" as const, spot }))} emptyMessage="No places match that search." />
        <MorePlaces left={visiblePlaces.length - shown} onMore={showMore} />
        </>
      )}
    </section>
  );
}
