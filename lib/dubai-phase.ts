// Which of the two authored palettes the product is wearing.
//
// The design handoff is explicit that day and night are *two separately
// authored palettes selected by time of day*, not one palette dimmed — and
// that the user override exists but "should not be the primary control". So
// `auto` is the default, and it follows Dubai's clock rather than the
// viewer's: a plan is a Dubai plan whether you open it from Deira or Denver.
//
// Pure functions here, no DOM. `components/ThemeSync.tsx` does the applying.

export type Ground = "day" | "night";
export type ThemePreference = "auto" | Ground;

/** Where the preference is persisted. Shared with the older night toggle. */
export const THEME_KEY = "deal-three:theme";

/** Night starts at 17:00 Asia/Dubai — "roughly 5 PM" in the handoff. */
export const NIGHT_FROM_HOUR = 17;
/** ...and runs until 06:00, when the sand ground takes over again. */
export const DAY_FROM_HOUR = 6;

/**
 * The hour of day in Dubai, 0-23, for a given instant.
 *
 * Uses `Intl` with an explicit time zone rather than a fixed +04:00 offset:
 * the offset happens to be constant today (the UAE does not observe DST), but
 * hardcoding it is the kind of assumption that silently rots.
 */
export function dubaiHour(now: Date = new Date()): number {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    hour: "2-digit",
    hour12: false,
  }).format(now);
  // "24" is a legal en-GB rendering of midnight; normalise it to 0.
  return Number(hour) % 24;
}

/** The ground the Dubai clock asks for, ignoring any user override. */
export function groundForHour(hour: number): Ground {
  return hour >= NIGHT_FROM_HOUR || hour < DAY_FROM_HOUR ? "night" : "day";
}

/** The ground the Dubai clock asks for right now. */
export function autoGround(now: Date = new Date()): Ground {
  return groundForHour(dubaiHour(now));
}

/** The ground actually rendered, once a preference is taken into account. */
export function resolveGround(
  preference: ThemePreference,
  now: Date = new Date(),
): Ground {
  return preference === "auto" ? autoGround(now) : preference;
}

/** Narrow an unknown stored value; anything unrecognised falls back to auto. */
export function readPreference(raw: string | null | undefined): ThemePreference {
  return raw === "day" || raw === "night" || raw === "auto" ? raw : "auto";
}

/**
 * Subscribe to the ground currently on `<html data-theme>`.
 *
 * The document is the single source of truth for the theme, so a component
 * that needs to *read* it (a toggle wanting to label itself "Day" or "Night",
 * and to report an honest `aria-pressed`) should subscribe rather than keep a
 * second copy in React state. Mirroring it in a `useState` + `useEffect` pair
 * is what let the page disagree with the document once already.
 *
 * `useSyncExternalStore` is the primitive built for exactly this: the server
 * snapshot is what the server stamped, so there is no hydration mismatch.
 */
export function subscribeToGround(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

export function currentGround(): Ground {
  return document.documentElement.dataset.theme === "night" ? "night" : "day";
}
