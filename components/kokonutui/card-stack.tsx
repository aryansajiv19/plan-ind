"use client";

/**
 * @author: @dorianbaffier
 * @description: Card Stack
 * @version: 1.1.0
 * @date: 2025-06-26
 * @license: MIT
 * @website: https://kokonutui.com
 * @github: https://github.com/kokonut-labs/kokonutui
 *
 * Re-tokenised and re-purposed for plan-ind (design-system/SPECS.md §5):
 * "the deck" — nine places dealt across three rounds, the product's real
 * mechanic, replacing the generic four-fintech-product demo this shipped
 * with. Cards are typographic only, matching the rest of the app's
 * photo-less treatment (PhotoTile) rather than the original's hotlinked
 * Unsplash URLs, which next.config has no remotePatterns allowlist for.
 */

import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { categoryMeta } from "@/lib/categories";
import type { Spot } from "@/lib/types";
import { cn } from "@/lib/utils";

interface DeckSpot {
  id: string;
  round: 1 | 2 | 3;
  name: string;
  area: string;
  category: string;
  price_band: string;
}

// Shown only when no real spots are passed in (the signed-out marketing
// hero) — same illustrative-not-invented posture as DECISION_ROWS in
// HomeExperience.tsx, one screen over: real Dubai venue names, clearly a
// preview rather than a fabricated account's own data.
const ILLUSTRATIVE_DECK: DeckSpot[] = [
  { id: "d1", round: 1, name: "Ninive", area: "Emirates Towers", category: "dinner", price_band: "$$$" },
  { id: "d2", round: 1, name: "The Guild", area: "DIFC", category: "vibes", price_band: "$$" },
  { id: "d3", round: 1, name: "Koko Bay", area: "Palm Jumeirah", category: "beach_club", price_band: "$$$" },
  { id: "d4", round: 2, name: "Reform Social", area: "DIFC", category: "dinner", price_band: "$$" },
  { id: "d5", round: 2, name: "Sushi Samba", area: "DIFC", category: "dinner", price_band: "$$$" },
  { id: "d6", round: 2, name: "Zero Gravity", area: "Skydive Dubai", category: "beach_club", price_band: "$$" },
  { id: "d7", round: 3, name: "La Cantine", area: "DIFC", category: "cafe", price_band: "$$" },
  { id: "d8", round: 3, name: "White Dubai", area: "Meydan", category: "nightlife", price_band: "$$$" },
  { id: "d9", round: 3, name: "Kite Beach", area: "Jumeirah", category: "outdoors", price_band: "$" },
];

function toDeck(spots: Spot[]): DeckSpot[] {
  return spots.slice(0, 9).map((spot, index) => ({
    id: spot.id,
    round: (Math.floor(index / 3) + 1) as 1 | 2 | 3,
    name: spot.name,
    area: spot.area,
    category: spot.category,
    price_band: spot.price_band,
  }));
}

const CARD_WIDTH = 320;
const CARD_OVERLAP = 240;

interface CardProps {
  spot: DeckSpot;
  index: number;
  totalCards: number;
  isExpanded: boolean;
  reducedMotion: boolean;
}

const Card = ({
  spot,
  index,
  totalCards,
  isExpanded,
  reducedMotion,
}: CardProps) => {
  const centerOffset = (totalCards - 1) * 5;
  const defaultX = index * 10 - centerOffset;
  const defaultY = index * 2;
  const defaultRotate = index * 1.5;

  const totalExpandedWidth =
    CARD_WIDTH + (totalCards - 1) * (CARD_WIDTH - CARD_OVERLAP);
  const expandedCenterOffset = totalExpandedWidth / 2;

  const spreadX =
    index * (CARD_WIDTH - CARD_OVERLAP) - expandedCenterOffset + CARD_WIDTH / 2;
  const spreadRotate = index * 5 - (totalCards - 1) * 2.5;

  const collapsedPose = {
    x: defaultX,
    y: defaultY,
    rotate: reducedMotion ? 0 : defaultRotate,
    scale: 1,
  };

  const expandedPose = {
    x: spreadX,
    y: 0,
    rotate: reducedMotion ? 0 : spreadRotate,
    scale: 1,
  };

  const cat = categoryMeta(spot.category);

  return (
    <motion.div
      animate={{
        ...(isExpanded ? expandedPose : collapsedPose),
        zIndex: totalCards - index,
      }}
      className={cn(
        "absolute inset-0 w-full rounded-2xl p-6",
        "bg-card",
        "border border-line",
        "backdrop-blur-xl backdrop-saturate-150",
        // Depth here is the hairline and the stack offset, not a drop shadow:
        // turn 8 was rejected for exactly that language.
        "hover:border-punch/60",
        "transition-[border-color,box-shadow] duration-300 ease-out",
        "transform-gpu overflow-hidden"
      )}
      initial={collapsedPose}
      style={{
        maxWidth: `${CARD_WIDTH}px`,
        left: "50%",
        marginLeft: `-${CARD_WIDTH / 2}px`,
      }}
      transition={
        reducedMotion
          ? { duration: 0.2, ease: "easeOut" }
          : {
              type: "spring",
              stiffness: 220,
              damping: 28,
              mass: 1,
              delay: isExpanded ? index * 0.04 : 0,
            }
      }
    >
      <div className="relative z-10">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">
          Round {spot.round}
        </p>

        <div className="mt-4 space-y-1">
          <span className="block text-left font-display font-extrabold text-3xl text-ink tracking-tight">
            {spot.name}
          </span>
          <span className="block text-left font-semibold text-muted">
            {spot.area}
          </span>
        </div>

        <div className="mt-4 flex items-center gap-3 text-sm">
          <span className="font-bold text-punch">{cat.code}</span>
          <span className="text-muted">{spot.price_band}</span>
        </div>
      </div>
    </motion.div>
  );
};

interface CardStackProps {
  className?: string;
  /** Real spots when available (a signed-in account); the illustrative deck otherwise. */
  spots?: Spot[];
}

export default function CardStackExample({ className, spots = [] }: CardStackProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const reducedMotion = useReducedMotion() ?? false;
  const deck = spots.length >= 9 ? toDeck(spots) : ILLUSTRATIVE_DECK;

  const handleToggle = () => setIsExpanded((prev) => !prev);

  return (
    <button
      aria-expanded={isExpanded}
      aria-label={isExpanded ? "Collapse the deck" : "Expand the deck"}
      className={cn(
        "relative mx-auto cursor-pointer",
        "min-h-[440px] w-full max-w-[90vw]",
        "md:max-w-[1200px]",
        "appearance-none border-0 bg-transparent p-0",
        "mb-8 flex items-center justify-center",
        className
      )}
      onClick={handleToggle}
      type="button"
    >
      {deck.map((spot, index) => (
        <Card
          index={index}
          isExpanded={isExpanded}
          key={spot.id}
          spot={spot}
          reducedMotion={reducedMotion}
          totalCards={deck.length}
        />
      ))}
    </button>
  );
}
