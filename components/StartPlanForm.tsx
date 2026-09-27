"use client";

import { useState } from "react";
import Link from "next/link";
import { categoryMeta } from "@/lib/categories";
import SmartSearchBox from "@/components/SmartSearchBox";
import DirectPlanSearch from "@/components/DirectPlanSearch";
import DealReveal from "@/components/DealReveal";
import ComposerDeck from "@/components/composer/ComposerDeck";
import TuneIt from "@/components/composer/TuneIt";
import { SAMPLE_POOLS } from "@/components/demo/sampleDecision";
import { useComposer } from "@/hooks/use-composer";
import type { PlanPrefill } from "@/lib/board-plan";

export default function StartPlanForm({
  age = 21,
  demoMode = false,
  prefill = null,
  smartSearchAvailable = false,
}: {
  age?: number;
  demoMode?: boolean;
  /** The server has a model key; without one the box is hidden (P7). */
  smartSearchAvailable?: boolean;
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
        Deal three rounds
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
    // The composer takes the hue of whichever group is open, so switching
    // tabs visibly recolours the form. Each tab overrides it with its own.
    <form onSubmit={start} className="plan-form">
      {modeToggle}
      {/* A pinned place explains itself in its own line below. */}
      {prefill && prefill.source !== "place" && (
        <p className="plan-form__demo-note" role="status">
          {prefill.source === "friend" ? `Set up for a plan with ${prefill.boardName}. Share the link with them once it’s dealt.`
            : prefill.source === "like" ? `Set up like ${prefill.boardName}: the same type and area.`
              : prefill.boardName
                ? `Set up from your board ${prefill.boardName}, leaning the way its places do. Check the type and area, then deal nine from the catalogue.`
                : "Picked up where you left off before signing in. Check it, then deal nine."}
        </p>
      )}
      {/* P25: reward before effort. The places, then the deal; every setting
          past that has a valid default and folds away under "Tune it". */}
      <ComposerDeck composer={composer} age={age} demoMode={demoMode} />

      <button
        type="submit"
        disabled={creating || !title.trim()}
        className="plan-submit"
      >
        {creating ? (demoMode ? "Dealing…" : "Dealing nine…") : demoMode ? "Preview the deal" : "Deal nine"}
      </button>

      {error && (
        <p role="alert" className="plan-form__error">
          {error}
        </p>
      )}

      <TuneIt
        composer={composer}
        demoMode={demoMode}
        luna={smartSearchAvailable && (
          <SmartSearchBox
            query={smartQuery}
            onQueryChange={(query) => { setSmartQuery(query); setSmartIntent(null); }}
            intent={smartIntent}
            onIntent={applyIntent}
            demoMode={demoMode}
            onSignIn={signIn}
          />
        )}
      />

      {demoMode && (
        <p className="plan-form__demo-note">
          Exploring the preview? <Link href="/login?next=/home" onClick={stashDraft}>Sign in</Link> to save, share and vote on a real plan.
        </p>
      )}
    </form>
  );
}
