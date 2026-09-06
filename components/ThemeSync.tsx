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
      // PARKED 2026-09-07 (owner: "Keep light mode in the dark for now. Hold
      // it back."). Light's values are intact and correct; only the path that
      // selects them is disabled. Dark is the identity now (SPECS.md §23), so
      // this is §19.2's park run in the opposite direction.
      //
      // This is the SECOND of two pin sites, and the one that actually bites.
      // The server stamps first paint in app/layout.tsx; this re-resolves on
      // mount, on a `storage` event, and every 60s. Pin the server only and
      // the app looks correct, then flips up to a minute later — which is why
      // §19.2's "the single point where it is decided" was wrong and §23.8
      // names both sites up front. The resolution above still runs, so the
      // clock stays exercised and correct.
      //
      // To restore: apply `ground` instead of `parked` here, re-enable the
      // ground selection in app/layout.tsx, and bring back the nav toggle in
      // components/HomeExperience.tsx. See SPECS.md §23.8.
      void ground;
      const parked: Ground = "night";
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
