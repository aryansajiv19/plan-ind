// P21: the "when" poll's times, all in Dubai wall time (UTC+4, no DST).
const DUBAI_MS = 4 * 3_600_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const LABEL = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Dubai", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true,
});

/** "Fri 3 Oct, 8pm" (Dubai time). */
export function whenLabel(iso: string): string {
  return LABEL.format(new Date(iso)).replace(":00", "").replace(" am", "am").replace(" pm", "pm");
}

// The instant of a Dubai wall time: `daysAhead` from today in Dubai, at `hour`.
function dubaiAt(now: Date, daysAhead: number, hour: number): Date {
  const dubaiMidnight = Math.floor((now.getTime() + DUBAI_MS) / DAY) * DAY - DUBAI_MS;
  return new Date(dubaiMidnight + daysAhead * DAY + hour * HOUR);
}

/**
 * Times to offer before the host types one: the next three evenings at 8pm
 * (tonight only while it is still an hour away) and the coming weekend
 * (Friday 8pm, Saturday 1pm). Sorted, unique, at most five.
 */
export function whenSuggestions(now: Date): string[] {
  const dubaiDay = new Date(now.getTime() + DUBAI_MS).getUTCDay(); // 0 Sunday … 5 Friday, 6 Saturday
  const toFriday = (5 - dubaiDay + 7) % 7;
  const toSaturday = (6 - dubaiDay + 7) % 7;
  const candidates = [
    dubaiAt(now, 0, 20), dubaiAt(now, 1, 20), dubaiAt(now, 2, 20),
    dubaiAt(now, toFriday, 20), dubaiAt(now, toSaturday, 13),
  ].filter((at) => at.getTime() >= now.getTime() + HOUR);
  return [...new Set(candidates.map((at) => at.toISOString()))].sort().slice(0, 5);
}

/** 073's rule for a host's picks: none, or 2 to 4 distinct future times within 60 days. */
export function whenPicksValid(picks: readonly string[], now: Date): boolean {
  if (picks.length === 0) return true;
  if (picks.length < 2 || picks.length > 4 || new Set(picks).size !== picks.length) return false;
  return picks.every((iso) => {
    const at = Date.parse(iso);
    return at > now.getTime() && at <= now.getTime() + 60 * DAY;
  });
}
