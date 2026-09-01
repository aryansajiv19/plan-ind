"use client";

import { useEffect } from "react";
import {
  THEME_KEY,
  readPreference,
  resolveGround,
  type Ground,
} from "@/lib/dubai-phase";

/**
 * Keeps `<html data-theme>` honest.
 *
 * The server already stamps the auto ground into the markup (see
 * `app/layout.tsx`), which is what stops a sand-to-black flash on first paint.
 * This does the two things the server cannot:
 *
 *  1. applies a stored user override, which lives in localStorage; and
 *  2. re-checks on a timer, so a tab left open across 17:00 Dubai actually
 *     turns over instead of sitting in the wrong palette all evening.
 *
 * The re-check is a plain 60s interval rather than a scheduled timeout at the
 * boundary: a laptop that sleeps through 17:00 never fires the timeout, and
 * one cheap comparison a minute is not worth being clever about.
 */
export default function ThemeSync({ serverGround }: { serverGround: Ground }) {
  useEffect(() => {
    const root = document.documentElement;

    const apply = () => {
      let preference: ReturnType<typeof readPreference> = "auto";
      try {
        preference = readPreference(window.localStorage.getItem(THEME_KEY));
      } catch {
        // Storage can throw outright in a locked-down browser. Auto is a fine
        // answer, and losing the override is better than an unstyled page.
      }
      const ground = resolveGround(preference);
      if (root.dataset.theme !== ground) root.dataset.theme = ground;
    };

    apply();
    const id = window.setInterval(apply, 60_000);
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_KEY) apply();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("storage", onStorage);
    };
  }, [serverGround]);

  return null;
}
