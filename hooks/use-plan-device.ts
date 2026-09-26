"use client";

import { useEffect, useRef, useState } from "react";
import { addBeen, getBeen } from "@/lib/device";

// What this browser remembers about plans: the theme it last used, and the
// past winners behind the "New to you" chip.
export function usePlanDevice(decided: boolean, winnerId: string | null) {
  const [nightMode, setNightMode] = useState(false);
  const [been] = useState(getBeen); // past winners on this device, for "New to you"
  const revealFired = useRef(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setNightMode(window.localStorage.getItem("deal-three:theme") === "night");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  // Record the winner once when the decision arrives. A reopened plan (057)
  // goes back to open, so the latch resets -- otherwise the re-decide would
  // never record its winner.
  useEffect(() => {
    if (!decided) { revealFired.current = false; return; }
    if (!winnerId || revealFired.current) return;
    revealFired.current = true;
    addBeen(winnerId);
  }, [decided, winnerId]);

  return { nightMode, been };
}
