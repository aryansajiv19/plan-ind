"use client";

import { useLayoutEffect, useRef } from "react";

// SPECS.md §25.3 beat 1 — the vote lands. A voter's face travels from the
// presence row onto the card they chose. This replaces a counter ticking
// up: a number says how many, a face says who, and who is the reason a
// group is on this screen together.
//
// FLIP, done the way §25.7 requires: the element is ALWAYS rendered at its
// real layout position, and the animation only plays the journey. It is
// never primed with an inline transform that a later frame has to clear —
// that pattern strands the avatar mid-flight forever if the frame never
// arrives, which is exactly what happens to a guest who switches apps
// mid-vote and comes back. Web Animations gives a destination that is
// correct whether or not the animation ever runs.
//
// A name can be on screen in two places at once — its seat and the card it
// picked — so positions are keyed by slot + name, never by name alone. Keyed
// by name, the seat and the card overwrite each other and every re-render
// flies one of them in from the other. A face already in its slot only
// animates if layout moved it; a face NEW to a slot flies in from wherever
// that name just left (the card it un-picked), else from its seat.
//
// Runs after every render on purpose (no deps): any render can move a face.
// Shared by the live vote page and the /demo/vote sample.
export function useFaceFlight() {
  const facePositions = useRef(new Map<string, { name: string; box: DOMRect }>());
  useLayoutEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const previous = facePositions.current;
    const seen = new Map<string, { name: string; box: DOMRect }>();
    const nodes = [...document.querySelectorAll<HTMLElement>("[data-face-name]")];
    for (const node of nodes) {
      const name = node.dataset.faceName;
      if (name) seen.set(`${node.dataset.faceSlot ?? ""}:${name}`, { name, box: node.getBoundingClientRect() });
    }
    facePositions.current = seen;
    if (reduced) return;
    for (const node of nodes) {
      const name = node.dataset.faceName;
      if (!name) continue;
      const key = `${node.dataset.faceSlot ?? ""}:${name}`;
      const box = seen.get(key)!.box;
      let from = previous.get(key)?.box;
      if (!from) {
        const others = [...previous.entries()].filter(([k, v]) => v.name === name && k !== key);
        from = (others.find(([k]) => !seen.has(k)) ?? others.find(([k]) => k.startsWith("seat:")))?.[1].box;
      }
      if (!from) continue;
      const dx = from.left - box.left;
      const dy = from.top - box.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      node.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
        { duration: 420, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
      );
    }
  });
}
