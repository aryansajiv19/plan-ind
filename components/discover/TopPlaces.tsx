"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import VenuePhoto from "@/components/VenuePhoto";
import { useTopPlaces } from "@/hooks/use-top-places";
import type { Spot } from "@/lib/types";

// Discover's "Top places": the community's best-ranked (085's place scores,
// shown once five or more people have ranked a place), Dubai-wide or by area.
export default function TopPlaces({ spots }: { spots: Spot[] }) {
  const [area, setArea] = useState<string | null>(null);
  const areas = useMemo(() => [...new Set(spots.map((s) => s.area))].sort(), [spots]);
  const top = useTopPlaces(area, 8);

  return (
    <section className="top-places" aria-labelledby="top-places-title">
      <div className="top-places__head">
        <h2 id="top-places-title">Top places {area ? `in ${area}` : "in Dubai"}</h2>
        <select aria-label="Area" value={area ?? ""} onChange={(e) => setArea(e.target.value || null)}>
          <option value="">All Dubai</option>
          {areas.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      {top.status === "failed" && <p className="demo-empty" role="alert">Top places didn’t load. Refresh to try again.</p>}
      {top.status === "ready" && (top.places.length === 0 ? (
        <p className="demo-empty">Top places appear once five people have ranked a place. Rank the ones you’ve been to on Been.</p>
      ) : (
        <ol className="top-places__list">
          {top.places.map((place, i) => (
            <li key={place.spot_id}>
              <Link href={`/place/${place.spot_id}`} className="top-places__card">
                <span className="top-places__photo">
                  <VenuePhoto spot={{ id: place.spot_id, photo_url: place.photo_url, photo_attribution: place.photo_attribution, google_place_id: place.google_place_id, category: place.category }} sizes="16rem" />
                  <span className="top-places__rank">#{i + 1}</span>
                </span>
                <strong>{place.name}</strong>
                <span>{place.area} · <b>{place.score.toFixed(1)}</b> from {place.raters} people</span>
              </Link>
            </li>
          ))}
        </ol>
      ))}
    </section>
  );
}
