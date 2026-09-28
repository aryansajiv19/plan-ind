"use client";

import Link from "next/link";
import WeightRise from "@/components/WeightRise";
import VenuePhoto, { useGooglePhotos } from "@/components/VenuePhoto";
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
  dateLabel,
  name,
  fixtures,
  spots,
  counts,
}: {
  greeting: string;
  dateLabel?: string;
  name: string;
  fixtures: boolean;
  spots: Spot[];
  counts?: CuratedCounts | null;
}) {
  // Photographed venues first; the wall already ranks them that way.
  const google = useGooglePhotos();
  const pictured = (spot: Spot) => hasVenuePhoto(spot, google);
  const tiles = [...spots.filter(pictured), ...spots.filter((spot) => !pictured(spot))].slice(0, MOSAIC_TILES);

  return (
    <section id="top" className="home-hero" aria-labelledby="home-title">
      <p className="cover__band">
        <span className="cover__issue">{greeting}{name ? `, ${name}` : ""}{dateLabel ? ` · ${dateLabel}` : ""}</span>
        <strong>Tonight in Dubai</strong>
        {counts ? <span>{counts.places} places{counts.categories ? ` · ${counts.categories} kinds of night` : ""}</span> : null}
        <span>Nine dealt · three rounds · one winner</span>
      </p>

      <div className="cover__mosaic" aria-hidden="true">
        {tiles.map((spot, index) => (
          <div key={spot.id} className="cover__tile deal-card__typographic">
            <span className="cover__tile-name">{spot.name}</span>
            {/* The first tile is the landing's LCP (Lighthouse): preloaded at high priority; the rest load normally. */}
            <VenuePhoto spot={spot} sizes="(min-width: 720px) 34vw, 67vw" preload={index === 0} fetchPriority={index === 0 ? "high" : undefined} />
          </div>
        ))}
      </div>

      <div className="home-hero__copy">
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
          {/* The product without an email: /demo/vote plays the whole journey,
              sample data, no account. */}
          <Link href="/demo/vote" className="home-secondary-cta">
            {fixtures ? "See a sample vote" : "Try it, no sign-up"}
          </Link>
        </div>
      </div>
    </section>
  );
}
