// "Open till 1am" → what that means right now, or at the plan's start.
//
// spots.open_till is free text holding a closing time only ('12am', '1:30am',
// '11pm', 'late'). Nothing records when a venue OPENS, so this never says
// "Open now": 2pm at a 1am bar could be before it opens. It says only what
// a closing time can prove:
//   - within an hour of closing, it is open ("Closes in 40 min");
//   - after closing and before the earliest plausible reopening, it is shut
//     ("Closed now");
//   - otherwise it repeats the listing ("Open till 1am").
// Times are the Dubai clock: the venue is in Dubai wherever the viewer is.

import { dubaiMinuteOfDay } from "./dubai-phase.ts";

export type ClosingTime =
  | { kind: "clock"; minute: number }
  | { kind: "late" }
  | { kind: "all-day" };

/**
 * The service day runs 06:00 to 06:00. A 1am close belongs to the evening
 * before it, and nothing that closes overnight is assumed to reopen before
 * 06:00, so "Closed now" is only ever claimed between closing and 06:00.
 */
export const SERVICE_DAY_START = 6 * 60;
/** How close to closing "Closes in N min" starts. Also the proof it is open. */
export const CLOSING_SOON_MINUTES = 60;
/** A start closer to closing than this gets a warning on the decided plan. */
export const TIGHT_START_MINUTES = 90;

const DAY = 24 * 60;

/** Parse the listing. `null` when it is not a time this module understands. */
export function parseOpenTill(raw: string | null | undefined): ClosingTime | null {
  const text = (raw ?? "").trim().toLowerCase().replace(/^(open\s+)?(till|until|to)\s+/, "");
  if (!text) return null;
  if (/^(late|late night|very late)$/.test(text)) return { kind: "late" };
  if (/^(24 ?h(ours|rs)?|24\/7)$/.test(text)) return { kind: "all-day" };
  if (text === "midnight") return { kind: "clock", minute: 0 };
  if (text === "noon") return { kind: "clock", minute: 12 * 60 };

  const twelve = /^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)$/.exec(text);
  if (twelve) {
    const hour = Number(twelve[1]);
    const minute = twelve[2] === undefined ? 0 : Number(twelve[2]);
    if (hour < 1 || hour > 12 || minute > 59) return null;
    return { kind: "clock", minute: ((hour % 12) + (twelve[3] === "pm" ? 12 : 0)) * 60 + minute };
  }
  const twentyFour = /^(\d{1,2})[:.](\d{2})$/.exec(text);
  if (twentyFour) {
    const hour = Number(twentyFour[1]);
    const minute = Number(twentyFour[2]);
    if (hour > 24 || minute > 59 || (hour === 24 && minute > 0)) return null;
    return { kind: "clock", minute: (hour % 24) * 60 + minute };
  }
  return null;
}

/** 0-1439 → "1am", "1:30am", "12am", "12pm". */
export function formatClock(minuteOfDay: number): string {
  const m = ((minuteOfDay % DAY) + DAY) % DAY;
  const hour = Math.floor(m / 60);
  const minute = m % 60;
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}${minute ? `:${String(minute).padStart(2, "0")}` : ""}${hour < 12 ? "am" : "pm"}`;
}

/** The listing as a label, with no claim about any particular moment. */
export function hoursLabel(raw: string | null | undefined): string | null {
  const parsed = parseOpenTill(raw);
  if (parsed?.kind === "clock") return `Open till ${formatClock(parsed.minute)}`;
  if (parsed?.kind === "late") return "Open late";
  if (parsed?.kind === "all-day") return "Open 24 hours";
  const text = (raw ?? "").trim();
  return text ? `Hours: ${text}` : null;
}

// Minutes since the service day began, so 1am sorts after 11pm.
const serviceOffset = (minuteOfDay: number) => (minuteOfDay - SERVICE_DAY_START + DAY) % DAY;

/** A closing time the clock can reason about: not late, not all day, not 06:00. */
function closingOffset(raw: string | null | undefined): { minute: number; offset: number } | null {
  const parsed = parseOpenTill(raw);
  if (parsed?.kind !== "clock") return null;
  const offset = serviceOffset(parsed.minute);
  // A 6am close ends exactly where the service day starts: no window exists
  // in which it is provably open or provably shut.
  return offset === 0 ? null : { minute: parsed.minute, offset };
}

export type OpenStatus =
  | { kind: "listed"; label: string }
  | { kind: "closing-soon"; minutes: number; label: string }
  | { kind: "closed"; label: string };

/** What the listing says about `now`. `null` only when there is no listing. */
export function openStatus(raw: string | null | undefined, now: Date): OpenStatus | null {
  const label = hoursLabel(raw);
  if (!label) return null;
  const close = closingOffset(raw);
  if (!close) return { kind: "listed", label };
  const left = close.offset - serviceOffset(dubaiMinuteOfDay(now));
  if (left <= 0) return { kind: "closed", label: "Closed now" };
  if (left <= CLOSING_SOON_MINUTES) return { kind: "closing-soon", minutes: left, label: `Closes in ${left} min` };
  return { kind: "listed", label };
}

export type EventFit =
  | { kind: "listed"; label: string }
  | { kind: "fits"; label: string }
  | { kind: "check-opening"; label: string }
  | { kind: "tight"; minutes: number; label: string }
  | { kind: "after-close"; label: string };

/**
 * The listing against the plan's start time. "Fine" is a claim about the
 * closing time only; a daytime start at a venue that closes late at night
 * says so instead, because it may not have opened yet.
 */
export function fitForEvent(raw: string | null | undefined, start: Date): EventFit | null {
  const label = hoursLabel(raw);
  if (!label) return null;
  const close = closingOffset(raw);
  if (!close || Number.isNaN(start.getTime())) return { kind: "listed", label };

  const startMinute = dubaiMinuteOfDay(start);
  const at = formatClock(startMinute);
  const shuts = formatClock(close.minute);
  const left = close.offset - serviceOffset(startMinute);
  if (left <= 0) return { kind: "after-close", label: `Closes at ${shuts}, before your ${at} start` };
  if (left < TIGHT_START_MINUTES) {
    return { kind: "tight", minutes: left, label: `Closes at ${shuts}, only ${left} min after your ${at} start` };
  }
  const daytimeStart = startMinute >= SERVICE_DAY_START && startMinute < 17 * 60;
  const closesAtNight = close.offset >= serviceOffset(20 * 60);
  if (daytimeStart && closesAtNight) {
    return { kind: "check-opening", label: `Open till ${shuts}. Check it opens by ${at}` };
  }
  const article = /^(8|11)\D/.test(at) ? "an" : "a";
  return { kind: "fits", label: `Open till ${shuts}, fine for ${article} ${at} start` };
}
