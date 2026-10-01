"use client";

import Link from "next/link";
import WeightRise from "@/components/WeightRise";
import VenuePhoto, { useGooglePhotos } from "@/components/VenuePhoto";
import { hasRealPhoto } from "@/lib/venue-photo";
import { avatarStyle, initialsOf } from "@/lib/avatar";
import { SAMPLE_FRIENDS, SAMPLE_VOTER } from "@/components/demo/sampleDecision";
import type { CuratedCounts } from "@/lib/spots/catalogue";
import type { Spot } from "@/lib/types";

const MOSAIC_TILES = 12;

// The sample group from /demo/vote, mid-decision: friends deciding together on
// the first screen. Labelled as sample data (house rule 1); no usage numbers.
const SAMPLE_GROUP = [...SAMPLE_FRIENDS, SAMPLE_VOTER];
const first = (name: string) => name.split(" ")[0];
const GROUP_LINE = `${first(SAMPLE_FRIENDS[0])}, ${first(SAMPLE_FRIENDS[1])} + ${SAMPLE_GROUP.length - 2} deciding Thursday dinner · Round 2, 4 of ${SAMPLE_GROUP.length} voted`;

/**
 * The cover: real venue photography in a dense mosaic behind the cover line,
 * a gold issue band on top, the action bottom-left. A venue without a photo
 * still takes its tile, set as type, so the cover is never a hole.
 */
export default function HomeHero({
  spots,
  counts,
}: {
  spots: Spot[];
  counts?: CuratedCounts | null;
}) {
  // Photographed venues first; the wall already ranks them that way.
  const google = useGooglePhotos();
  const pictured = (spot: Spot) => hasRealPhoto(spot, google); // the cover wants photographs, not art
  const tiles = [...spots.filter(pictured), ...spots.filter((spot) => !pictured(spot))].slice(0, MOSAIC_TILES);

  return (
    <section id="top" className="home-hero" aria-labelledby="home-title">
      {/* One line, not a ticker: the steps are told just below the cover. */}
      <p className="cover__band">
        <strong>Tonight in Dubai</strong>
        {counts ? <span>{counts.places} places, {counts.categories} kinds of night</span> : null}
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
        <h1 id="home-title" className="home-title" aria-label="Dubai plans without the group chat." data-ui-ok="tight display leading: lines are 0.95 apart on purpose; glyphs do not touch">
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
          {/* The product without an email leads: /demo/vote plays the whole
              journey on sample data, no account. Planning for real follows. */}
          <Link href="/demo/vote" className="home-primary-cta">Try the demo</Link>
          <a href="#plan-lab" className="home-secondary-cta">Start a plan</a>
        </div>

        <Link href="/demo/vote" className="home-hero__group">
          <span className="vote-face-stack" aria-hidden="true">
            {SAMPLE_GROUP.map((name) => <span key={name} style={avatarStyle(name)}>{initialsOf(name)}</span>)}
          </span>
          <span><strong>Sample group</strong> · {GROUP_LINE}</span>
        </Link>
      </div>
    </section>
  );
}
