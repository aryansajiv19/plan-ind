"use client";

import { useState } from "react";
import type { DemoDeck } from "@/components/demo/demoDecks";
import { SAMPLE_PLAN } from "@/components/demo/sampleDecision";

// Describe the night on /demo/vote: one canned brief and its answer, fixed,
// so a visitor sees prompt → plan without an account and without a model
// call. Labelled a sample. The real box (SmartSearchBox) needs a sign-in.

const BRIEF = "Something active for the five of us on Thursday, nothing too pricey";
const TARGET = "sports";
const FACTS = ["Sports", SAMPLE_PLAN.originLabel, `≤ AED ${SAMPLE_PLAN.budgetPerPerson}`, "active"];

export default function DemoLuna({ decks, onPick }: { decks: DemoDeck[]; onPick: (deck: DemoDeck) => void }) {
  const [asked, setAsked] = useState(false);
  const deck = decks.find((option) => option.key === TARGET);
  if (!deck) return null;

  return (
    <section className="plan-smart-search mt-6" aria-labelledby="demo-luna-heading">
      <label id="demo-luna-heading" htmlFor="demo-luna-input" className="plan-form__label">Describe the night</label>
      <div className="plan-smart-search__bar">
        <input id="demo-luna-input" value={BRIEF} readOnly />
        <button type="button" onClick={() => { setAsked(true); onPick(deck); }}>Build it</button>
      </div>
      {asked && (
        <div className="plan-smart-result" aria-live="polite">
          <p className="plan-smart-result__facts">{FACTS.join(" · ")}</p>
          <p>A sample answer. Signed in, this reads whatever you write.</p>
        </div>
      )}
    </section>
  );
}
