"use client";

import Image from "next/image";
import Link from "next/link";
import WeightRise from "@/components/WeightRise";
import { HERO_TILES } from "@/components/landing/heroTiles";
import { avatarStyle, initialsOf } from "@/lib/avatar";
import { SAMPLE_FRIENDS, SAMPLE_VOTER } from "@/components/demo/sampleDecision";

// The sample group from /demo/vote, mid-decision: friends deciding together on
// the first screen. Labelled as sample data (house rule 1); no usage numbers.
const SAMPLE_GROUP = [...SAMPLE_FRIENDS, SAMPLE_VOTER];
const first = (name: string) => name.split(" ")[0];
const GROUP_LINE = `${first(SAMPLE_FRIENDS[0])}, ${first(SAMPLE_FRIENDS[1])} + ${SAMPLE_GROUP.length - 2} deciding Thursday dinner · Round 2, 4 of ${SAMPLE_GROUP.length} voted`;

/**
 * The cover: the line and the one action first, then a hand-picked set of our
 * own photographs (components/landing/heroTiles.ts). On a phone the words come
 * before the pictures, so the headline and "Try the demo" are on the first
 * screen; on a desktop the photos take the right half.
 */
export default function HomeHero() {
  return (
    <section id="top" className="home-hero" aria-labelledby="home-title">
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

      <div className="cover__mosaic" aria-hidden="true">
        {HERO_TILES.map((tile, index) => (
          <div key={tile.id} className="cover__tile">
            {/* The first is the desktop LCP: fetched first, never lazy; the rest load lazily. */}
            {/* The right half, three columns: the lead tile spans two (~34vw), the rest one (~17vw); a phone shows three across. */}
            <Image src={tile.photo} alt="" fill sizes={index === 0 ? "34vw" : "(min-width: 851px) 17vw, 34vw"}
              loading={index === 0 ? "eager" : "lazy"} fetchPriority={index === 0 ? "high" : undefined} />
            <span className="cover__tile-name">{tile.name}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
