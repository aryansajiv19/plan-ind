"use client";

import { useDeckPlaces } from "@/hooks/use-deck-places";
import PlaceRow, { type RowCard } from "@/components/composer/PlaceRow";
import type { ReactNode } from "react";
import type { Composer } from "@/hooks/use-composer";
import { SIGN_ARABIC, signColourFor } from "@/components/landing/sign-palette";
import lab from "@/components/composer/SignComposer.module.css";

/**
 * P25: what kind of hangout, then the real places its deal draws from. A tap
 * pins a place into the vote, one per round in pin order; the preview has no
 * session to pin with, so there the deck is a window, not a control.
 */
export default function ComposerDeck({ composer, age, demoMode, shelf }: { composer: Composer; age: number; demoMode: boolean; shelf?: ReactNode }) {
  const { groups, shownGroup, visibleCategories, category, pickCategory, setActiveGroup, pins, togglePin, roundOf, pinnedIds } = composer;
  const deck = useDeckPlaces(category, age, true);
  const full = pinnedIds.length >= 3;
  // A pinned place from elsewhere (a board, a place page) leads the deck.
  const cards: RowCard[] = [
    ...pins.filter((pin) => pin.from !== "shelf" && (deck.state !== "ready" || !deck.places.some((place) => place.id === pin.id))),
    ...(deck.state === "ready" ? deck.places : []),
  ];
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
            data-colour={signColourFor(c.key)}
          >
            {c.label}
            {SIGN_ARABIC[c.key] && <span className={lab.kufi} lang="ar" dir="rtl" aria-hidden="true">{SIGN_ARABIC[c.key]}</span>}
          </button>
          ))}
        </div>
      </fieldset>

      {shelf}

      <PlaceRow
        titleId="plan-deck-title"
        title={demoMode ? "Real places a deal like this draws from"
          : full ? "Three pinned, one per round. Undo one to pin another."
            : "Nine places, three rounds. Tap one to make sure it’s in."}
        cards={cards}
        loading={deck.state === "loading"}
        interactive={!demoMode}
        full={full}
        roundOf={roundOf}
        onToggle={togglePin}
        empty={
          <p className="mt-2 text-xs text-muted">
            {deck.state === "failed" ? "These places didn’t load. Dealing nine still works." : "No places to show for this type yet. Dealing nine still works."}
          </p>
        }
      />
    </>
  );
}
