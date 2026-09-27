"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import WeightRise from "@/components/WeightRise";
import CardStackExample from "@/components/kokonutui/card-stack";
import type { Spot } from "@/lib/types";

// The signed-out pitch (/ and /demo): the headline, and beside it the deck,
// nine real places that fan out on a tap (owner's pick), photographed spots
// first. A signed-in account opens onto the composer instead.
export default function HomeHero({ greeting, name, fixtures, spots }: { greeting: string; name: string; fixtures: boolean; spots: Spot[] }) {
  // SPECS.md §14.3: scroll-based depth drift on the front-door hero. A single
  // scroll-position custom property, not a JS animation loop: this effect
  // only computes the number and writes it via setProperty; the motion is
  // plain CSS (.home-hero__copy / .home-stage).
  const heroRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const hero = heroRef.current;
    if (!hero) return;
    let ticking = false;
    function applyHeroScroll() {
      // 0 until the hero's top scrolls past the viewport top, then ramps up,
      // capped at the hero's own height: depth within the hero, not parallax.
      const rect = hero!.getBoundingClientRect();
      hero!.style.setProperty("--hero-scroll", `${Math.min(Math.max(0, -rect.top), rect.height)}px`);
    }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        applyHeroScroll();
        ticking = false;
      });
    }
    applyHeroScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <section id="top" ref={heroRef} className="home-hero" aria-labelledby="home-title">
      <div className="home-hero__copy">
        <p className="home-hello home-reveal" style={{ "--delay": "80ms" } as React.CSSProperties}>
          {greeting}{name ? `, ${name}` : ""}.
        </p>

        <h1 id="home-title" className="home-title" aria-label="Dubai plans without the group chat.">
          <span className="home-title__line home-title__line--one">Dubai plans,</span>
          <span className="home-title__line home-title__line--two">without the</span>
          <span className="home-title__line home-title__line--three">
            {/* Only the last line rises: the weight change is the emphasis,
                so spending it on every line would spend it on nothing. */}
            <strong><WeightRise delay={0.51}>group chat.</WeightRise></strong>
          </span>
        </h1>

        <p className="home-deck home-reveal" style={{ "--delay": "680ms" } as React.CSSProperties}>
          Dinner in DIFC or padel in Al Quoz. Set a budget, and the group picks from nine places in three quick rounds.
        </p>

        <div className="home-actions home-reveal" style={{ "--delay": "780ms" } as React.CSSProperties}>
          <a href="#plan-lab" className="home-primary-cta">Start a plan</a>
          {/* The product without an email: /demo/vote plays a whole sample
              decision from fixtures. */}
          <Link href="/demo/vote" className="home-secondary-cta">
            {fixtures ? "See a sample vote" : "Try the demo"}
          </Link>
        </div>
      </div>

      {/* Not aria-hidden: the deck is a real button (expand / collapse). */}
      <div className="home-stage home-reveal" style={{ "--delay": "420ms" } as React.CSSProperties}>
        <CardStackExample spots={spots} />
      </div>
    </section>
  );
}
