"use client";

import { useRef, type KeyboardEvent } from "react";
import Image from "next/image";
import PhotoCredit from "@/components/PhotoCredit";
import { categoryMeta } from "@/lib/categories";
import { useDeckPlaces } from "@/hooks/use-deck-places";
import type { Composer, PinnedPlace } from "@/hooks/use-composer";

type Card = PinnedPlace & { min_spend?: number; category?: string; cuisine?: string };

// The deck is one Tab stop (roving tabindex): arrows, Home and End walk the
// cards, so a keyboard reaches "Deal nine" without stepping through 20 places.
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

/**
 * P25: what kind of hangout, then the real places its deal draws from. A tap
 * pins a place into the vote, one per round in pin order; the preview has no
 * session to pin with, so there the deck is a window, not a control.
 */
export default function ComposerDeck({ composer, age, demoMode }: { composer: Composer; age: number; demoMode: boolean }) {
  const { groups, shownGroup, visibleCategories, category, pickCategory, setActiveGroup, pins, togglePin, roundOf, pinnedIds } = composer;
  const deck = useDeckPlaces(category, age, true);
  const row = useRef<HTMLUListElement>(null);
  // A mouse has no sideways swipe: these page the row by most of its width.
  const page = (direction: 1 | -1) => row.current?.scrollBy({
    left: direction * row.current.clientWidth * 0.8,
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
  });
  const full = pinnedIds.length >= 3;
  const focusable = (card: Card) => !full || roundOf(card.id) != null;
  // A pinned place from elsewhere (a board, a place page) leads the deck.
  const cards: Card[] = [
    ...pins.filter((pin) => deck.state !== "ready" || !deck.places.some((place) => place.id === pin.id)),
    ...(deck.state === "ready" ? deck.places : []),
  ];
  const tabStop = Math.max(0, cards.findIndex(focusable)); // the deck's one Tab stop

  const face = (card: Card) => (
    <>
      <span className="plan-deck__band">
        {card.photo_url ? (
          <>
            <Image src={card.photo_url} alt="" fill sizes="10rem" className="object-cover" unoptimized />
            <PhotoCredit spot={card} />
          </>
        ) : (
          // No photo: the vote card's typographic band (P27), not an empty frame.
          <span className="plan-deck__type">
            {card.category && <span className="plan-deck__code">{categoryMeta(card.category).code}{card.cuisine ? ` · ${card.cuisine}` : ""}</span>}
            <span className="plan-deck__name">{card.name}</span>
          </span>
        )}
      </span>
      <span className="plan-deck__caption">
        {card.photo_url && <strong className="font-semibold text-ink">{card.name}</strong>}
        <span>{card.area}{card.min_spend != null ? ` · from AED ${card.min_spend}` : ""}</span>
      </span>
    </>
  );

  return (
    <>
      <fieldset>
        <legend className="plan-form__label">What kind of hangout?</legend>
        <div className="plan-category-groups" aria-label="Category groups">
          {groups.map((group) => (
            <button
              key={group.key}
              type="button"
              onClick={() => setActiveGroup(group.key)}
              aria-pressed={shownGroup?.key === group.key}
              className="plan-category-group"
            >
              {group.label}
            </button>
          ))}
        </div>

        <div className="plan-category-options">
          {visibleCategories?.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => pickCategory(c)}
            aria-pressed={category === c.key}
            className="plan-category-option"
          >
            {c.label}
          </button>
          ))}
        </div>
      </fieldset>

      <section className="mt-4" aria-labelledby="plan-deck-title">
        <div className="flex items-center justify-between gap-2">
          <p id="plan-deck-title" className="text-xs text-muted">
            {demoMode ? "Real places a deal like this draws from"
              : full ? "Three pinned, one per round. Undo one to pin another."
                : "Nine places, three rounds. Tap one to make sure it’s in."}
          </p>
          {cards.length > 3 && (
            <span className="plan-deck__paging">
              <button type="button" onClick={() => page(-1)} aria-label="Earlier places" data-dir="back" />
              <button type="button" onClick={() => page(1)} aria-label="More places" />
            </span>
          )}
        </div>
        {deck.state !== "loading" && cards.length === 0 ? (
          <p className="mt-2 text-xs text-muted">
            {deck.state === "failed" ? "These places didn’t load. Dealing nine still works." : "No places to show for this type yet. Dealing nine still works."}
          </p>
        ) : (
          <ul ref={row} className="plan-deck__row" onKeyDown={walk} aria-busy={deck.state === "loading"}>
            {cards.map((card, index) => {
              const round = roundOf(card.id);
              return (
                <li key={card.id} className="grid snap-start content-start gap-0.5">
                  {demoMode ? (
                    <div className="plan-deck__card">{face(card)}</div>
                  ) : (
                    <button type="button" className="plan-deck__card" data-deck-card tabIndex={index === tabStop ? 0 : -1} aria-pressed={round != null} disabled={round == null && full} onClick={() => togglePin(card)}>
                      {face(card)}
                      <span className="sr-only">{round != null ? `, pinned in round ${round}` : ", pin into the vote"}</span>
                    </button>
                  )}
                  {round != null && (
                    <p className="flex items-center justify-between text-xs font-semibold text-[var(--color-punch-text)]">
                      <span aria-hidden="true">In round {round}</span>
                      <button type="button" className="min-h-11 px-1.5 font-normal text-muted underline underline-offset-4" onClick={() => togglePin(card)} aria-label={`Undo, take ${card.name} out of the vote`}>Undo</button>
                    </p>
                  )}
                </li>
              );
            })}
            {deck.state === "loading" && [0, 1, 2, 3].map((i) => (
              <li key={`loading-${i}`} className="grid snap-start content-start" aria-hidden="true">
                <span className="plan-deck__card plan-deck__card--loading"><span className="plan-deck__band" /></span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
