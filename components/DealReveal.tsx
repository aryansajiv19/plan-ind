"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import PhotoCredit from "@/components/PhotoCredit";
import VenuePhoto from "@/components/VenuePhoto";

/** Length of the whole sequence. Kept under 1.5s (PRIORITIES X2). */
export const DEAL_REVEAL_MS = 1300;

const EASE_SETTLE = [0.22, 1, 0.36, 1] as const;
const ROUNDS = [0, 1, 2] as const;

export interface RevealCard {
  /** With an id, a Google-photo place shows its photo too (VenuePhoto). */
  id?: string;
  google_place_id?: string | null;
  name: string;
  area: string;
  /** With its credit: a licence obligation wherever the photo renders. */
  photo_url?: string | null;
  photo_attribution?: string | null;
}

/**
 * The deal, made visible: "Reading the room…", the constraints the host set
 * as chips, then nine cards dealt into three rows of three. A one-shot
 * entrance that runs alongside the create request rather than in front of
 * it — the form waits for whichever of the two finishes last.
 *
 * `onShown` fires when the sequence has played (at once under reduced
 * motion, where everything renders in its end state). Only what arrives
 * animates; nothing loops.
 *
 * `cards`, round by round, turns the real places over: the deal's own (P26),
 * the signed-out preview's (P8), or the sample decks. Without them the
 * cards stay face down, marked with the category code.
 */
export default function DealReveal({
  constraints,
  code,
  cards,
  onShown,
  children,
}: {
  constraints: readonly string[];
  code: string;
  cards?: readonly RevealCard[];
  onShown: () => void;
  /** Rendered once the sequence has played: a status line or next step. */
  children?: ReactNode;
}) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const onShownRef = useRef(onShown);

  useEffect(() => {
    onShownRef.current = onShown;
  }, [onShown]);

  useEffect(() => {
    // The submit button this replaced is gone; keep keyboard focus on the
    // page, and bring the (much shorter) reveal into view below the nav.
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "start" });
    const timer = setTimeout(() => {
      setShown(true);
      onShownRef.current();
    }, reduced ? 0 : DEAL_REVEAL_MS);
    return () => clearTimeout(timer);
  }, [reduced]);

  const enter = (delay: number, y: number) => ({
    initial: reduced ? false : { opacity: 0, y },
    animate: { opacity: 1, y: 0 },
    transition: { delay, duration: 0.22, ease: EASE_SETTLE },
  } as const);
  // A real card turns over into place (P26); the face-down deal slides in.
  const flip = (delay: number) => ({
    initial: reduced ? false : { opacity: 0, rotateY: -75 },
    animate: { opacity: 1, rotateY: 0 },
    transition: { delay, duration: 0.28, ease: EASE_SETTLE },
    style: { transformPerspective: 700 },
  } as const);

  return (
    <section className="plan-form" aria-labelledby="deal-reveal-heading">
      <h2
        ref={heading}
        id="deal-reveal-heading"
        tabIndex={-1}
        // Focused programmatically, never tabbed to, so no ring: inline,
        // because the night ring is an unlayered box-shadow that outranks
        // any utility. The global scroll-margin keeps it clear of the nav.
        style={{ outline: "none", boxShadow: "none" }}
        className="font-display text-2xl font-medium tracking-tight"
      >
        <span role="status">{shown ? "Nine places, three rounds." : "Reading the room…"}</span>
      </h2>

      {constraints.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="What the deal is working from">
          {constraints.map((label, i) => (
            <motion.li
              key={label}
              {...enter(0.2 + i * 0.05, 4)}
              className="rounded-full border border-line px-2.5 py-1 text-xs font-medium text-muted"
            >
              {label}
            </motion.li>
          ))}
        </ul>
      )}

      <ol className="mt-5 grid gap-3" aria-label="Nine places in three rounds">
        {ROUNDS.map((round) => (
          <li key={round}>
            <p className="text-xs font-medium text-muted">Round {round + 1}</p>
            <ul className="mt-1.5 grid grid-cols-3 gap-2">
              {ROUNDS.map((slot) => {
                const index = round * 3 + slot;
                const card = cards?.[index];
                if (card) {
                  // The vote card's band in miniature: the photo with its
                  // credit, or the name in the display serif.
                  return (
                    <motion.li key={slot} {...flip(0.5 + index * 0.06)} className="flex flex-col overflow-hidden rounded-lg border border-line bg-card">
                      {/* Layers: the sand-dune card, the photo over it when there is
                          one (own, or Google's for members), a scrim, the name. So a
                          place never shows as an empty box while its photo loads. */}
                      <span className="deal-card__typographic relative block aspect-[4/3]">
                        {card.id ? (
                          <VenuePhoto
                            spot={{ id: card.id, photo_url: card.photo_url ?? null, photo_attribution: card.photo_attribution ?? null, google_place_id: card.google_place_id }}
                            sizes="(max-width: 640px) 33vw, 16rem"
                            className="object-cover"
                          />
                        ) : card.photo_url ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element -- a 1.3s moment; same unoptimized posture as the cards */}
                            <img src={card.photo_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                            <PhotoCredit spot={{ photo_url: card.photo_url, photo_attribution: card.photo_attribution ?? null }} />
                          </>
                        ) : null}
                        <span className="pointer-events-none absolute inset-0 flex items-end bg-[image:var(--photo-scrim)] p-3 font-display text-xl leading-tight tracking-tight">
                          <span className="line-clamp-3">{card.name}</span>
                        </span>
                      </span>
                      <span className="px-2.5 py-1.5">
                        <span className="block truncate text-[0.7rem] text-muted">{card.area}</span>
                      </span>
                    </motion.li>
                  );
                }
                return (
                  <motion.li
                    key={slot}
                    {...enter(0.5 + index * 0.06, 8)}
                    className="flex min-h-16 flex-col justify-center rounded-lg border border-line bg-card p-2.5"
                  >
                    <span className="text-center text-xs font-medium tracking-widest text-muted">
                      <span aria-hidden="true">{code}</span>
                      <span className="sr-only">Place {index + 1}</span>
                    </span>
                  </motion.li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>

      {shown && children}
    </section>
  );
}
