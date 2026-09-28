"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import VenuePhoto from "@/components/VenuePhoto";
import { hasVenuePhoto } from "@/lib/venue-photo";
import { categoryMeta } from "@/lib/categories";

/** A place as a composer row shows it: the deck (P25) and My places. */
export type RowCard = {
  id: string;
  name: string;
  area: string;
  photo_url: string | null;
  photo_attribution: string | null;
  google_place_id?: string | null;
  category?: string;
  cuisine?: string;
  min_spend?: number;
};

// A row is one Tab stop (roving tabindex): arrows, Home and End walk the
// cards, so a keyboard reaches "Deal nine" without stepping through them all.
function walk(event: KeyboardEvent<HTMLUListElement>) {
  const cards = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-deck-card]:not(:disabled)")];
  const at = cards.indexOf(document.activeElement as HTMLElement);
  const to = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: cards.length - 1 }[event.key];
  if (at < 0 || to === undefined) return;
  event.preventDefault();
  const next = cards[Math.min(cards.length - 1, Math.max(0, to))];
  cards.forEach((card) => { card.tabIndex = card === next ? 0 : -1; });
  next.focus();
  next.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function Face({ card }: { card: RowCard }) {
  return (
    <>
      <span className="plan-deck__band">
        {hasVenuePhoto(card) ? (
          <VenuePhoto spot={card} sizes="10rem" />
        ) : (
          // No photo: the vote card's typographic band (P27), not an empty frame.
          <span className="plan-deck__type">
            {card.category && <span className="plan-deck__code">{categoryMeta(card.category).code}{card.cuisine ? ` · ${card.cuisine}` : ""}</span>}
            <span className="plan-deck__name">{card.name}</span>
          </span>
        )}
      </span>
      <span className="plan-deck__caption">
        {hasVenuePhoto(card) && <strong className="font-semibold text-ink">{card.name}</strong>}
        <span>{card.area}{card.min_spend ? ` · from AED ${card.min_spend}` : ""}</span>
      </span>
    </>
  );
}

/**
 * A horizontal, snap-scrolling row of places to pin into the vote, one per
 * round in pin order ("In round N", with Undo). `interactive` off makes it a
 * window: the preview has no session to pin with.
 */
export default function PlaceRow({
  titleId, title, cards, loading, interactive, full, roundOf, onToggle, empty,
}: {
  titleId: string;
  title: ReactNode;
  cards: RowCard[];
  loading: boolean;
  interactive: boolean;
  /** Three pinned: unpinned cards are switched off. */
  full: boolean;
  roundOf: (id: string) => number | null;
  onToggle: (card: RowCard) => void;
  /** Shown instead of the row once loaded with nothing in it. */
  empty: ReactNode;
}) {
  const row = useRef<HTMLUListElement>(null);
  // A mouse has no sideways swipe: these page the row by most of its width.
  const page = (direction: 1 | -1) => row.current?.scrollBy({
    left: direction * row.current.clientWidth * 0.8,
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
  });
  const tabStop = Math.max(0, cards.findIndex((card) => !full || roundOf(card.id) != null));

  return (
    <section className="mt-4" aria-labelledby={titleId}>
      <div className="flex items-center justify-between gap-2">
        <p id={titleId} className="text-xs text-muted">{title}</p>
        {cards.length > 3 && (
          <span className="plan-deck__paging">
            <button type="button" onClick={() => page(-1)} aria-label="Earlier places" data-dir="back" />
            <button type="button" onClick={() => page(1)} aria-label="More places" />
          </span>
        )}
      </div>
      {!loading && cards.length === 0 ? empty : (
        <ul ref={row} className="plan-deck__row" onKeyDown={walk} aria-busy={loading}>
          {cards.map((card, index) => {
            const round = roundOf(card.id);
            return (
              <li key={card.id} className="grid snap-start content-start gap-0.5">
                {interactive ? (
                  <button type="button" className="plan-deck__card" data-deck-card tabIndex={index === tabStop ? 0 : -1} aria-pressed={round != null} disabled={round == null && full} onClick={() => onToggle(card)}>
                    <Face card={card} />
                    <span className="sr-only">{round != null ? `, pinned in round ${round}` : ", pin into the vote"}</span>
                  </button>
                ) : (
                  <div className="plan-deck__card"><Face card={card} /></div>
                )}
                {round != null && (
                  <p className="flex items-center justify-between text-xs font-semibold text-[var(--color-punch-text)]">
                    <span aria-hidden="true">In round {round}</span>
                    <button type="button" className="min-h-11 px-1.5 font-normal text-muted underline underline-offset-4" onClick={() => onToggle(card)} aria-label={`Undo, take ${card.name} out of the vote`}>Undo</button>
                  </p>
                )}
              </li>
            );
          })}
          {loading && [0, 1, 2, 3].map((i) => (
            <li key={`loading-${i}`} className="grid snap-start content-start" aria-hidden="true">
              <span className="plan-deck__card plan-deck__card--loading"><span className="plan-deck__band" /></span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
