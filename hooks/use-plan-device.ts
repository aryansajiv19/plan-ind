"use client";

import { useEffect, useState } from "react";
import { getBeen } from "@/lib/device";

// What this browser remembers about plans: the theme it last used, and the
// past visits behind the "New to you" chip (added when you rate, P11: a
// decision alone is not a visit).
export function usePlanDevice() {
  const [nightMode, setNightMode] = useState(false);
  const [been] = useState(getBeen); // past winners on this device, for "New to you"

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setNightMode(window.localStorage.getItem("deal-three:theme") === "night");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);


  return { nightMode, been };
}
