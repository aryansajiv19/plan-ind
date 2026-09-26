"use client";

import { useEffect, useState } from "react";
import type { Plan } from "@/lib/types";

// SPECS.md §25.3 beat 3 — the round closes. Losers FOLD rather than
// vanish, so the eye can follow where they went, and the winner then takes
// the full row before handing off to WinnerReveal. Gravity lands into that
// moment rather than competing with it.
//
// The two steps are separated by a timer rather than by an animation
// callback, for §25.7's reason: if the fold never plays — reduced motion,
// a backgrounded tab — the layout must still arrive at "winner alone, full
// width". The timer owns the destination; the transition only plays the
// journey.
//
// The beat only plays for someone who was HERE when the round closed.
// Arriving at an already-decided plan and watching three cards appear and
// then fold is a flash of content that immediately deletes itself — the
// eye follows something that was never a decision being made. Those
// viewers get the settled layout on their first render instead.
//
// Gated on `plan &&` because `decided` is false while the plan is still
// loading, and without that every cold arrival would look like a round
// closing.
// Captured once, the first time a plan actually loads. Set DURING RENDER,
// which is React's documented way to adjust state from new data — a ref
// cannot be read during render in React 19, and doing this in an effect
// trips the cascading-render rule this repo has hit three times. The
// condition is self-limiting: it can only fire while the value is null.
export function useRoundFold(plan: Plan | null, decided: boolean) {
  const [arrivedDecided, setArrivedDecided] = useState<boolean | null>(null);
  if (plan && arrivedDecided === null) {
    setArrivedDecided(plan.status === "decided");
  }
  const sawOpenRound = arrivedDecided === false;

  const [foldTimerDone, setFoldTimerDone] = useState(false);
  useEffect(() => {
    if (!decided || !sawOpenRound) return;
    const timer = setTimeout(() => setFoldTimerDone(true), 360);
    return () => clearTimeout(timer);
  }, [decided, sawOpenRound]);
  const foldDone = decided && (!sawOpenRound || foldTimerDone);
  return { sawOpenRound, foldDone };
}
