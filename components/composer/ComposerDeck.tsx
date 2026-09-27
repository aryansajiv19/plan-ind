"use client";

import type { Composer } from "@/hooks/use-composer";

/** What kind of hangout: the category groups and their types, and a pinned place. */
export default function ComposerDeck({ composer }: { composer: Composer }) {
  const { groups, shownGroup, visibleCategories, category, pickCategory, setActiveGroup, placePin, setPlacePin } = composer;
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

      {placePin && (
        <p className="mt-4 flex flex-wrap items-center gap-x-3 text-sm">
          <span><strong>{placePin.name}</strong> is in round 1; the other eight are dealt around it.</span>
          <button type="button" className="min-h-11 text-muted underline underline-offset-4" onClick={() => setPlacePin(null)}>Remove</button>
        </p>
      )}
    </>
  );
}
