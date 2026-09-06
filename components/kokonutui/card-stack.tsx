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
import { useCallback, useEffect, useRef, useState } from "react";
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
/** The spread the design wants when there is room for it. */
const DESIGN_STEP = CARD_WIDTH - CARD_OVERLAP;
/** Degrees of fan per card at full spread. */
const DESIGN_ROTATE_STEP = 5;
/** Flattest the fan is allowed to go before it stops reading as a fan. */
const MIN_ROTATE_SCALE = 0.3;
/** The resting stack's own spread — same treatment, smaller numbers. */
const COLLAPSED_STEP = 10;
const COLLAPSED_ROTATE_STEP = 1.5;

/**
 * How far the expanded fan may spread, given the box it actually sits in.
 *
 * The bug this exists to prevent: the spread used to be a constant —
 * CARD_WIDTH + (n-1)*(CARD_WIDTH-CARD_OVERLAP), i.e. 960px for a nine-card
 * deck — with no reference to the container. In the hero that container is
 * ~543px, so the fan overhung it by ~200px on each side at EVERY viewport:
 * on the left it covered the hero's own lede text, and on the right it ran
 * under the hero's overflow:hidden and got sliced mid-card. Measured before
 * the fix at 1512px: 3 cards over the copy by up to 213px, 3 cards past the
 * hero's right edge by up to 274px.
 *
 * A rotated card is wider than CARD_WIDTH — at angle t its bounding width is
 * w*cos(t) + h*sin(t) — so the height matters too, and the taller the deck
 * the less room is left to spread. Both the step and the fan angle scale
 * down together until the whole thing fits, because flattening the fan is
 * what buys back the width that rotation costs.
 */
function fitFan(
  available: number,
  height: number,
  totalCards: number,
  designStep: number,
  designRotateStep: number,
) {
  // Before the container has been measured, hold the cards stacked rather
  // than falling back to the designed spread. The design values are the
  // unbounded ones that caused the overflow in the first place, so painting
  // them for even one frame reintroduces the bug — and in a browser where
  // the measurement lands a frame later, that is a visible jump outward.
  // Stacked is always inside; the fan opens once the width is known.
  if (!available || totalCards < 2) return { step: 0, rotateStep: 0 };

  // Widest the fan is allowed to be, with a small inset so a card edge never
  // sits flush against the container's own edge.
  const budget = available - 8;

  // Angle and spread compete for the same width: a steeper fan makes each
  // card's bounding box wider, which leaves less room to spread them apart.
  // So this does not just take the first fit — at the designed 20° the only
  // fitting spread was 10.5px, barely distinguishable from the collapsed
  // stack's 10px, which would have left the deck looking like expanding did
  // nothing. Full angle is used only when there is room for the full spread
  // too; otherwise the fan flattens to MIN_ROTATE_SCALE, which buys back the
  // width that rotation was costing and keeps the expansion legible.
  const spreadAt = (scale: number) => {
    const rotateStep = designRotateStep * scale;
    const outermost = (((totalCards - 1) * rotateStep) / 2) * (Math.PI / 180);
    const rotatedWidth =
      CARD_WIDTH * Math.cos(outermost) + height * Math.sin(outermost);
    const room = budget - rotatedWidth;
    return { rotateStep, step: room <= 0 ? 0 : Math.min(designStep, room / (totalCards - 1)) };
  };

  for (let scale = 1; scale > MIN_ROTATE_SCALE; scale -= 0.05) {
    const fit = spreadAt(scale);
    if (fit.step >= designStep) return fit;
  }
  const flattest = spreadAt(MIN_ROTATE_SCALE);
  return flattest.step > 0 ? flattest : { step: 0, rotateStep: 0 };
}

interface CardProps {
  spot: DeckSpot;
  index: number;
  totalCards: number;
  isExpanded: boolean;
  reducedMotion: boolean;
  /** Measured container box, so both poses can be sized to fit it. */
  fan: { step: number; rotateStep: number };
  rest: { step: number; rotateStep: number };
}

const Card = ({
  spot,
  index,
  totalCards,
  isExpanded,
  reducedMotion,
  fan,
  rest,
}: CardProps) => {
  const mid = (totalCards - 1) / 2;
  const defaultX = (index - mid) * rest.step;
  const defaultY = index * 2;
  const defaultRotate = (index - mid) * rest.rotateStep;

  // Centred on the middle card, at whatever spread actually fits (fitFan).
  const spreadX = (index - mid) * fan.step;
  const spreadRotate = (index - mid) * fan.rotateStep;

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

  // The fan is sized from the box it is actually given, not from a constant.
  // Measured rather than assumed because the same deck sits in a ~543px hero
  // column on desktop and a near-full-width one on a phone.
  const shellRef = useRef<HTMLButtonElement | null>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });

  const measure = useCallback((el: HTMLButtonElement | null) => {
    if (!el) return;
    const r = el.getBoundingClientRect();
    setBox((prev) =>
      Math.abs(prev.width - r.width) < 1 && Math.abs(prev.height - r.height) < 1
        ? prev
        : { width: r.width, height: r.height },
    );
  }, []);

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    measure(el);
    // Not a resize listener: the hero is a grid, so this box changes when the
    // COLUMN changes, which a window resize event does not always imply.
    const ro = new ResizeObserver(() => measure(el));
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  const rest = fitFan(box.width, box.height, deck.length, COLLAPSED_STEP, COLLAPSED_ROTATE_STEP);
  const fitted = fitFan(box.width, box.height, deck.length, DESIGN_STEP, DESIGN_ROTATE_STEP);
  // In a container too narrow for the full fan, the fitted expanded spread can
  // come out TIGHTER than the resting one — expanding would visibly contract
  // the deck. Fall back to the resting pose rather than contracting: it is
  // already fitted, so it stays inside, and "expanding does nothing here" is
  // an honest outcome where "expanding closes the deck" is just wrong. The
  // two poses are never mixed, since a big step from one and a big angle from
  // the other can overflow together even though each fits alone.
  const fan = fitted.step > rest.step ? fitted : rest;

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
      ref={shellRef}
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
          fan={fan}
          rest={rest}
        />
      ))}
    </button>
  );
}
