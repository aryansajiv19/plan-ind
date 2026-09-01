"use client";

import { type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

/**
 * A headline that arrives by gaining weight.
 *
 * Turn 13: "Koko Bay arrives by gaining weight from 300 to 800, once, then
 * holds." It is the one piece of type motion in the system, and it only works
 * because the display face is variable — this is the reason the font swap
 * insisted on a real wght axis rather than four static cuts.
 *
 * Once, then holds, is load-bearing: a loop would be ambient motion carrying
 * no information, which the standards cap at two per screen and forbid from
 * carrying state. This is a one-shot entrance, so it costs nothing against
 * that budget.
 *
 * Under reduced motion it renders at the final weight immediately.
 *
 * Always a <span>. It used to take an `as` prop and build the element with
 * motion.create(), which returns a new component type per call — that
 * remounts the subtree every render and restarts the animation forever.
 * Semantics belong to the caller: wrap it, <strong><WeightRise>…</WeightRise></strong>.
 */
export default function WeightRise({
  children,
  from = 300,
  to = 800,
  duration = 1.4,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  from?: number;
  to?: number;
  duration?: number;
  delay?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  if (reduced) {
    return (
      <span className={className} style={{ fontVariationSettings: `"wght" ${to}` }}>
        {children}
      </span>
    );
  }

  return (
    <motion.span
      className={className}
      initial={{ fontVariationSettings: `"wght" ${from}` }}
      animate={{ fontVariationSettings: `"wght" ${to}` }}
      transition={{ duration, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.span>
  );
}
