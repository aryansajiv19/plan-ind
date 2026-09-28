import { fitForEvent, hoursLabel } from "@/lib/open-hours";
import { groupCostLine } from "@/lib/price";
import { minimumAgeForCategory } from "@/lib/age-policy";
import { leaveBy } from "@/lib/directions";
import type { WeatherSummary } from "@/lib/weather";
import type { Spot } from "@/lib/types";

// "Tonight at a glance": everything the group would otherwise ask in the
// chat, one line each, from facts the plan already has. A row with nothing
// honest to say is left out rather than guessed.

export type TonightKey = "open" | "cost" | "age" | "weather" | "booking" | "leave" | "friends";
export interface TonightRow { key: TonightKey; label: string; value: string; warn: boolean }

export interface TonightInput {
  eventTime: string | null;
  spot: Pick<Spot, "open_till" | "min_spend" | "spend_pp_aed" | "category" | "minimum_age">;
  coming: number;
  booked: boolean | null;
  bookingOwner: string | null;
  weather: WeatherSummary | null;
  /** Minutes and how ("drive, estimate"), or null without an origin. */
  travel: { minutes: number; how: string } | null;
  /** Friends (not you) with a visit logged here; null when unread. */
  friendsBeen: number | null;
  now?: Date;
}

const WEATHER: Record<WeatherSummary["verdict"], { word: string; warn: boolean }> = {
  "extreme-heat": { word: "extreme heat, pick indoors", warn: true },
  hot: { word: "hot, shade or indoors", warn: true },
  rain: { word: "rain likely", warn: true },
  wind: { word: "windy, outdoor seating may be dusty", warn: true },
  warm: { word: "warm", warn: false },
  comfortable: { word: "comfortable", warn: false },
};

const clock = (d: Date) => d.toLocaleTimeString("en-GB", { timeZone: "Asia/Dubai", hour: "numeric", minute: "2-digit", hour12: true });

export function tonightRows(input: TonightInput): TonightRow[] {
  const rows: TonightRow[] = [];
  const start = input.eventTime ? new Date(input.eventTime) : null;

  const fit = start ? fitForEvent(input.spot.open_till, start) : null;
  const hours = fit ? fit.label : hoursLabel(input.spot.open_till);
  if (hours) rows.push({ key: "open", label: "Open", value: hours, warn: fit != null && fit.kind !== "fits" && fit.kind !== "listed" });

  const cost = groupCostLine(input.spot, input.coming);
  if (cost) rows.push({ key: "cost", label: "Cost", value: cost, warn: false });

  const age = Math.max(minimumAgeForCategory(input.spot.category), input.spot.minimum_age ?? 0);
  rows.push({ key: "age", label: "Age", value: age > 0 ? `${age}+ only` : "All ages", warn: age > 0 });

  if (input.weather) {
    const w = WEATHER[input.weather.verdict];
    rows.push({ key: "weather", label: "Weather", value: `${input.weather.tempC}°C, feels ${input.weather.feelsC}°C: ${w.word}`, warn: w.warn });
  }

  rows.push(input.booked
    ? { key: "booking", label: "Booking", value: input.bookingOwner ? `Booked by ${input.bookingOwner}` : "Booked", warn: false }
    : input.bookingOwner
      ? { key: "booking", label: "Booking", value: `${input.bookingOwner} is booking`, warn: false }
      : { key: "booking", label: "Booking", value: "Nobody is booking yet", warn: true });

  const leave = input.travel ? leaveBy(input.eventTime, input.travel.minutes, input.now) : null;
  if (leave && input.travel) {
    rows.push({ key: "leave", label: "Leave by", value: `${clock(leave)} · ≈ ${input.travel.minutes} min ${input.travel.how}`, warn: false });
  }

  if (input.friendsBeen && input.friendsBeen > 0) {
    rows.push({ key: "friends", label: "Friends", value: `${input.friendsBeen} of your friends ${input.friendsBeen === 1 ? "has" : "have"} been`, warn: false });
  }
  return rows;
}
