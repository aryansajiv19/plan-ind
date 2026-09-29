"use client";

import { useEffect } from "react";
import {
  THEME_COOKIE,
  readPreference,
  resolveGround,
  type Ground,
} from "@/lib/dubai-phase";

/** The stored preference, from the cookie the nav toggle writes. */
export function storedPreference() {
  const match = document.cookie.match(new RegExp(`(?:^|; )${THEME_COOKIE}=([^;]*)`));
  return readPreference(match?.[1]);
}

/**
 * Keeps `<html data-theme>` honest after first paint (app/layout.tsx stamps
 * that from the same cookie and clock). Re-checks every 60s, so a tab left
 * open across 17:00 Dubai turns over; a plain interval rather than a timeout
 * at the boundary, because a laptop that sleeps through 17:00 never fires one.
 */
export default function ThemeSync({ serverGround }: { serverGround: Ground }) {
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const ground = resolveGround(storedPreference());
      if (root.dataset.theme !== ground) root.dataset.theme = ground;
    };
    apply();
    const id = window.setInterval(apply, 60_000);
    return () => window.clearInterval(id);
  }, [serverGround]);

  return null;
}
