"use client";

import Link from "next/link";
import WeightRise from "@/components/WeightRise";
import VenuePhoto from "@/components/VenuePhoto";
import { hasVenuePhoto } from "@/lib/venue-photo";
import type { CuratedCounts } from "@/lib/spots/catalogue";
import type { Spot } from "@/lib/types";

const MOSAIC_TILES = 12;

/**
 * The cover: real venue photography in a dense mosaic behind the cover line,
 * a gold issue band on top, the action bottom-left. A venue without a photo
 * still takes its tile, set as type, so the cover is never a hole.
 */
export default function HomeHero({
  greeting,
  name,
  fixtures,
  spots,
  counts,
}: {
  greeting: string;
  name: string;
  fixtures: boolean;
  spots: Spot[];
  counts?: CuratedCounts | null;
}) {
  // Photographed venues first; the wall already ranks them that way.
  const tiles = [...spots.filter(hasVenuePhoto), ...spots.filter((spot) => !hasVenuePhoto(spot))].slice(0, MOSAIC_TILES);

  return (
    <section id="top" className="home-hero" aria-labelledby="home-title">
      <p className="cover__band">
        <strong>Tonight in Dubai</strong>
        {counts ? <span>{counts.places} places{counts.categories ? ` · ${counts.categories} kinds of night` : ""}</span> : null}
        <span>Nine dealt · three rounds · one winner</span>
      </p>

      <div className="cover__mosaic" aria-hidden="true">
        {tiles.map((spot, index) => (
          <div key={spot.id} className="cover__tile">
            <span className="cover__tile-name">{spot.name}</span>
            <VenuePhoto spot={spot} sizes="(min-width: 720px) 34vw, 67vw" preload={index < 2} />
          </div>
        ))}
      </div>

      <div className="home-hero__copy">
        <p className="home-hello">{greeting}{name ? `, ${name}` : ""}.</p>

        <h1 id="home-title" className="home-title" aria-label="Dubai plans without the group chat.">
          <span className="home-title__line home-title__line--one">Dubai plans,</span>
          <span className="home-title__line home-title__line--two">without the</span>
          <span className="home-title__line home-title__line--three">
            {/* Only the last line rises: the weight change is the emphasis. */}
            <strong><WeightRise delay={0.51}>group chat.</WeightRise></strong>
          </span>
        </h1>

        <p className="home-deck">
          Dinner in DIFC or padel in Al Quoz. Set a budget, and the group picks from nine places in three quick rounds.
        </p>

        <div className="home-actions">
          <a href="#plan-lab" className="home-primary-cta">Start a plan</a>
          {/* The product without an email: /demo/vote plays a whole sample
              decision from fixtures. */}
          <Link href="/demo/vote" className="home-secondary-cta">
            {fixtures ? "See a sample vote" : "Try the demo"}
          </Link>
        </div>
      </div>
    </section>
  );
}
