"use client";

import { useState } from "react";
import Link from "next/link";
import { categoryMeta } from "@/lib/categories";
import SmartSearchBox from "@/components/SmartSearchBox";
import DirectPlanSearch from "@/components/DirectPlanSearch";
import DealReveal from "@/components/DealReveal";
import ComposerDeck from "@/components/composer/ComposerDeck";
import TuneIt from "@/components/composer/TuneIt";
import MyPlacesShelf from "@/components/composer/MyPlacesShelf";
import { SAMPLE_POOLS } from "@/components/demo/sampleDecision";
import { useComposer } from "@/hooks/use-composer";
import { useStartGathering } from "@/hooks/use-start-gathering";
import type { PlanPrefill } from "@/lib/board-plan";

export default function StartPlanForm({
  age = 21,
  demoMode = false,
  prefill = null,
  smartSearchAvailable = false,
  sampleShelf = false,
}: {
  age?: number;
  demoMode?: boolean;
  /** The server has a model key; without one the box is hidden (P7). */
  smartSearchAvailable?: boolean;
  /** /demo: My places shows labelled sample places (the landing shows none). */
  sampleShelf?: boolean;
  /** "Plan from this board": initial values only. The form remounts per board. */
  prefill?: PlanPrefill | null;
}) {
  // SPECS.md §10.1's second entry point: "Deal three rounds" (the existing
  // flow, untouched below) vs "I already know where" (search, pick one
  // spot, hand off to DirectPlanForm — same component the place page's CTA
  // uses, so both doors converge on the same creation call). Demo-preview
  // only shows the deal flow — the direct path needs a real session either
  // way (create_direct_plan rejects signed-out/anonymous callers), same
  // reasoning as gating PlaceDirectPlanCta on a real user.
  const [mode, setMode] = useState<"deal" | "direct">("deal");
  const composer = useComposer({ age, demoMode, prefill });
  const { when, pinnedIds } = composer;
  const gather = useStartGathering({ category: composer.category, title: composer.title, times: when.picks });
  // Ask first unless a place is pinned: pins live in the nine, which only exist after a deal.
  const askFirst = !demoMode && pinnedIds.length === 0;
  const { category, title, creating, error, revealing, setRevealing, revealCards, revealShown, smartQuery, setSmartQuery, smartIntent, setSmartIntent, applyIntent, stashDraft, signIn, start, constraintChips } = composer;

  if (revealing) {
    return (
      <DealReveal
        constraints={constraintChips}
        code={categoryMeta(category).code}
        cards={revealCards ?? (demoMode ? SAMPLE_POOLS.flat() : undefined)}
        onShown={() => revealShown.current?.()}
      >
        {demoMode ? (
          <>
            <p className="plan-form__demo-note">
              {revealCards
                ? "Real places that fit your settings. Sign in to deal them for your own group."
                : "Sample places shown. Sign in to deal nine for your own group."}
            </p>
            <Link href="/demo/vote" className="plan-submit inline-flex items-center justify-center">See how the group votes</Link>
            <button type="button" className="mt-2 inline-flex min-h-11 w-full items-center justify-center text-sm text-muted underline underline-offset-4" onClick={() => setRevealing(false)}>
              Back to the form
            </button>
          </>
        ) : (
          <p className="plan-form__demo-note" role="status">Setting up the vote…</p>
        )}
      </DealReveal>
    );
  }

  const modeToggle = !demoMode && (
    <div className="plan-mode-toggle" role="group" aria-label="How do you want to plan?">
      <button type="button" aria-pressed={mode === "deal"} onClick={() => setMode("deal")}>
        Let the group vote
      </button>
      <button type="button" aria-pressed={mode === "direct"} onClick={() => setMode("direct")}>
        I already know where
      </button>
    </div>
  );

  if (mode === "direct") {
    return (
      <div className="plan-form">
        {modeToggle}
        <DirectPlanSearch age={age} />
      </div>
    );
  }

  return (
    <form onSubmit={start} className="plan-form">
      {modeToggle}
      {/* A pinned place explains itself in its own line below. */}
      {prefill && prefill.source !== "place" && (
        <p className="plan-form__demo-note" role="status">
          {prefill.source === "friend" ? `Set up for a plan with ${prefill.boardName}. Share the link with them once it’s dealt.`
            : prefill.source === "like" ? `Set up like ${prefill.boardName}: the same type and area.`
              : prefill.boardName
                ? `Set up from your board ${prefill.boardName}, leaning the way its places do. Check the type and area, then deal nine from the catalogue.`
                : "Picked up where you left off. Check it, then deal nine."}
        </p>
      )}
      {/* Luna first: describing the night is the fastest way in, so it sits
          above the kinds rather than folded under Tune it. */}
      {smartSearchAvailable && (
        <SmartSearchBox
          query={smartQuery}
          onQueryChange={(query) => { setSmartQuery(query); setSmartIntent(null); }}
          intent={smartIntent}
          onIntent={applyIntent}
          demoMode={demoMode}
          onSignIn={signIn}
        />
      )}
      {/* P25: reward before effort. The places, then the deal; every setting
          past that has a valid default and folds away under "Tune it". */}
      <ComposerDeck
        composer={composer}
        age={age}
        demoMode={demoMode}
        // Signed out there is no one's shelf to show, except /demo's labelled samples.
        shelf={(!demoMode || sampleShelf) && <MyPlacesShelf composer={composer} age={age} sample={demoMode} />}
      >
        <TuneIt composer={composer} demoMode={demoMode} />

        {/* The deal stays in reach from anywhere in the form, Tune it included:
            sticky at the bottom edge, on the card's own surface. */}
        <div className="plan-deal-bar">
          {(error || gather.error) && (
            <p role="alert" className="plan-form__error">
              {error ?? gather.error}
            </p>
          )}
          {!title.trim() && <p className="plan-form__demo-note">Give it a title under Tune it to continue.</p>}
          {askFirst && (
            <>
              {/* The default: ask the group first, deal after (docs/GROUP_PREFS.md). */}
              <button type="button" disabled={gather.asking || creating || !title.trim() || !when.valid} onClick={() => void gather.ask()} className="plan-submit">
                {gather.asking ? "Setting up…" : "Share and ask the group"}
              </button>
              <p className="plan-form__demo-note px-3">Friends answer three quick taps, then you deal places that suit everyone.</p>
            </>
          )}
          <button
            type="submit"
            disabled={creating || gather.asking || !title.trim()}
            className={askFirst ? "vote-secondary-action mt-2 w-full" : "plan-submit"}
          >
            {creating ? (demoMode ? "Dealing…" : "Dealing nine…") : demoMode ? "Preview the deal" : askFirst ? "Deal nine with my settings" : "Deal nine"}
          </button>
        </div>
      </ComposerDeck>

      {demoMode && (
        <p className="plan-form__demo-note">
          Exploring the preview? <Link href="/login?next=/home" onClick={stashDraft}>Sign in</Link> to save, share and vote on a real plan.
        </p>
      )}
    </form>
  );
}
