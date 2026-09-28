"use client";

import { useState } from "react";
import DealReveal from "@/components/DealReveal";
import SampleVote from "@/components/demo/SampleVote";
import { SAMPLE_FRIENDS, SAMPLE_PLAN } from "@/components/demo/sampleDecision";
import type { DemoDeck } from "@/components/demo/demoDecks";
import { categoryMeta } from "@/lib/categories";

// /demo/vote end to end, signed out: pick a kind of night, watch nine get
// dealt, vote three rounds and a final with the sample group, then the
// decided plan. The composer's and the deal's own classes and components,
// so the demo looks like the product; nothing is fetched but the forecast.

const CONSTRAINTS = [
  `Up to AED ${SAMPLE_PLAN.budgetPerPerson} pp`,
  `Within ${SAMPLE_PLAN.radiusKm} km of ${SAMPLE_PLAN.originLabel}`,
  `${SAMPLE_FRIENDS.length + 1} people`,
];

export default function DemoJourney({ decks, eventTime }: { decks: DemoDeck[]; eventTime: string }) {
  const [stage, setStage] = useState<"compose" | "deal" | "vote">("compose");
  const [deck, setDeck] = useState(decks[0]);
  // Each stage replaces the one above it, so it starts at the top of the page.
  const go = (next: typeof stage) => { setStage(next); window.scrollTo({ top: 0 }); };

  if (stage === "vote") return <SampleVote deck={deck} eventTime={eventTime} onReplay={() => go("compose")} />;

  if (stage === "deal") {
    return (
      <DealReveal constraints={CONSTRAINTS} code={categoryMeta(deck.key).code} cards={deck.pools.flat()} onShown={() => {}}>
        <button type="button" onClick={() => go("vote")} className="plan-submit mt-5 inline-flex w-full items-center justify-center">
          Start round one
        </button>
      </DealReveal>
    );
  }

  return (
    <section className="plan-form" aria-labelledby="demo-compose-heading">
      <h1 id="demo-compose-heading" className="font-display text-2xl font-medium tracking-tight sm:text-3xl">
        You and four friends. What kind of night?
      </h1>
      <p className="mt-1 text-sm text-muted">
        Pick one and the app deals nine real Dubai places that fit, three per round. The friends are made up and vote on their own.
      </p>
      <fieldset className="mt-4">
        <legend className="plan-form__label">What kind of hangout?</legend>
        <div className="plan-category-options">
          {decks.map((option) => (
            <button key={option.key} type="button" onClick={() => setDeck(option)} aria-pressed={deck.key === option.key} className="plan-category-option">
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>
      <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="The sample plan's settings">
        {CONSTRAINTS.map((label) => (
          <li key={label} className="rounded-full border border-line px-2.5 py-1 text-xs font-medium text-muted">{label}</li>
        ))}
      </ul>
      <button type="button" onClick={() => go("deal")} className="plan-submit mt-5 inline-flex w-full items-center justify-center">
        Deal nine
      </button>
    </section>
  );
}
