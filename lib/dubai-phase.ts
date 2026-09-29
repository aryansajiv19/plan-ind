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

/** The cookie holding a chosen ground, read by the server for first paint. */
export const THEME_COOKIE = "deal-three-theme";

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

/** Minutes since midnight in Dubai, 0-1439, for a given instant. */
export function dubaiMinuteOfDay(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return (part("hour") % 24) * 60 + part("minute");
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

// P23: a plan's time is entered and shown as Dubai wall time wherever the
// host is. The UAE has no daylight saving, so +04:00 is exact all year.
/** An ISO instant as the "YYYY-MM-DDTHH:mm" a datetime-local input shows, in Dubai. */
export function toDubaiInput(iso: string): string {
  return new Date(Date.parse(iso) + 4 * 3_600_000).toISOString().slice(0, 16);
}

/** A datetime-local value read as Dubai wall time, as an ISO instant; null if it isn't one. */
export function fromDubaiInput(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}:00+04:00`);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}
