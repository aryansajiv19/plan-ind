"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A whole number that rolls to its new value instead of swapping to it.
 *
 * Used for tallies that change while you are looking at them — a vote
 * arriving over realtime, someone else joining the plan. On first paint it
 * simply shows the number: a page that counts itself up from zero on load is
 * a slot machine, not feedback.
 *
 * Reduced motion snaps. That is checked here rather than left to the global
 * `transition-duration: 0.001ms` rule in globals.css, because this is a
 * script-driven animation and that rule cannot reach it.
 *
 * Honest limitation: a 0 -> 1 change has no in-between integer, so the roll
 * is invisible at the smallest delta. `.vote-count--changed` is what carries
 * that case; this earns its keep when a batch of votes lands at once.
 */
export default function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    const start = from.current;
    const delta = value - start;
    if (delta === 0) return;

    // ~90ms per step so two votes read faster than eight, clamped either
    // side: under 220ms nothing registers, over 700ms it is a wait.
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0
      : Math.min(700, Math.max(220, Math.abs(delta) * 90));
    const startedAt = performance.now();
    let frame = 0;

    const step = (now: number) => {
      const progress = duration === 0 ? 1 : Math.min(1, (now - startedAt) / duration);
      const eased = 1 - (1 - progress) ** 3; // easeOutCubic: fast, then settles
      const next = Math.round(start + delta * eased);
      from.current = next; // interrupted mid-roll? the next run starts here
      setShown(next);
      if (progress < 1) frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  // No wrapper element: this drops into whatever span already styles the
  // number, so nothing about layout or `tabular-nums` changes.
  return <>{shown}</>;
}
