"use client";

import { useState } from "react";
import type { DemoDeck } from "@/components/demo/demoDecks";
import { SAMPLE_PLAN } from "@/components/demo/sampleDecision";

// Luna on /demo/vote: one canned brief and the answer Luna gives it, fixed,
// so a visitor sees prompt → plan without an account and without a model
// call. Labelled a sample. The real box (SmartSearchBox) needs a sign-in.

const BRIEF = "Something active for the five of us on Thursday, nothing too pricey";
const TARGET = "sports";
const INTENT = {
  summary: `Move and play, up to AED ${SAMPLE_PLAN.budgetPerPerson} each, near ${SAMPLE_PLAN.originLabel}`,
  chips: ["group of five", "active", `≤ AED ${SAMPLE_PLAN.budgetPerPerson} pp`],
};

export default function DemoLuna({ decks, onPick }: { decks: DemoDeck[]; onPick: (deck: DemoDeck) => void }) {
  const [asked, setAsked] = useState(false);
  const deck = decks.find((option) => option.key === TARGET);
  if (!deck) return null;

  return (
    <section className="plan-smart-search mt-6" aria-labelledby="demo-luna-heading">
      <label id="demo-luna-heading" htmlFor="demo-luna-input" className="plan-form__label">Describe the night to Luna · sample</label>
      <div className="plan-smart-search__bar">
        <input id="demo-luna-input" value={BRIEF} readOnly />
        <button type="button" onClick={() => { setAsked(true); onPick(deck); }}>Build it</button>
      </div>
      {asked && (
        <div className="plan-smart-result" aria-live="polite">
          <div><strong>{INTENT.summary}</strong></div>
          <div>{INTENT.chips.map((chip) => <span key={chip}>{chip}</span>)}</div>
          <p>A fixed sample answer, no model call. Signed in, Luna reads whatever you write.</p>
        </div>
      )}
    </section>
  );
}
