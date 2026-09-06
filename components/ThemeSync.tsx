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
      // PARKED 2026-09-04 (owner: "no dark mode, or at least hold dark back
      // now, we'll see later"). Machinery intact and correct; only the path
      // that selects it is disabled. SPECS.md §19.2 names app/layout.tsx as
      // "the single point where it is decided", but there are two: the server
      // stamps the first paint there, and this re-resolves it on mount and
      // every 60s. Pinning only the server leaves the clock flipping the
      // document to night moments after hydration, so the park has to cover
      // this path too. The resolution above still runs, so the clock stays
      // exercised and correct. To restore: apply `ground` instead of `parked`
      // here, re-enable the ground selection in app/layout.tsx, and bring back
      // the nav toggle in components/HomeExperience.tsx. See SPECS.md §19.2.
      void ground;
      const parked: Ground = "day";
      if (root.dataset.theme !== parked) root.dataset.theme = parked;
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
