import type { Spot } from "@/lib/types";
import { minimumAgeForCategory } from "@/lib/age-policy";
import { dubaiToday } from "@/lib/spots/match";
import { REAL_PHOTO_FILTER } from "@/lib/venue-photo";

// P20 "Know before you go": only facts 070 actually holds, each with the
// source that says it. Unknown is null in the data and no row here.
/** The 070 columns this reads, for a spots select. */
export const FACT_COLUMNS = "phone, website, licensed, dress_code, parking, reservations, halal_friendly, vegetarian_options, spend_pp_aed, good_to_know, facts_checked_on, facts_sources";

export type FactRow = { label: string; value: string; href?: string; source: string | null };
export type VenueFacts = { rows: FactRow[]; checked: string | null };

type FactSpot = Pick<Spot, "category" | "minimum_age" | "phone" | "website" | "licensed" | "dress_code" | "parking"
  | "reservations" | "halal_friendly" | "vegetarian_options" | "spend_pp_aed" | "good_to_know" | "facts_checked_on" | "facts_sources">;

// ponytail: 070's sources are free-text claims, not keyed by field, so a row
// takes the first source whose claim mentions its subject. A row with no
// match shows no link rather than a guessed one. Drop this when the generator
// tags each source with its field.
const SUBJECT: Record<string, RegExp> = {
  Age: /\bage\b|\b(1[2-8]|21)\b|under-?\d|adults?/i,
  Alcohol: /licen|alcohol|beer|wine|cocktail|spirits|champagne|happy hour/i,
  "Dress code": /dress/i,
  Booking: /book|reserv|walk-in/i,
  Parking: /park|valet/i,
  Halal: /halal|pork/i,
  Vegetarian: /vegetarian|vegan/i,
  Spend: /AED|Dhs|price|menu|package/i,
  Phone: /phone|tel\b|\+971|\b0\d[\s-]?\d/i,
};

const BOOKING: Record<string, string> = { required: "Book ahead, it’s required", recommended: "Booking recommended", "walk-in": "Walk in, no booking" };

// "150-300" → "AED 150 to 300 each"; "500+", "<40", "0" and "150" too.
export function spendLabel(raw: string): string | null {
  const text = raw.trim();
  if (text === "0") return "Free";
  const range = text.match(/^(\d+)\s*-\s*(\d+)$/);
  if (range) return `AED ${range[1]} to ${range[2]} each`;
  if (/^\d+\+$/.test(text)) return `AED ${text.slice(0, -1)} and up, each`;
  if (/^<\s*\d+$/.test(text)) return `Under AED ${text.replace(/\D/g, "")} each`;
  if (/^\d+$/.test(text)) return `About AED ${text} each`;
  return null;
}

const MONTH = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** 070 for a client spots read: no retired curated row (visibility private),
 *  nothing closed until a later Dubai date, and no curated row without a real
 *  photo (lib/venue-photo.ts). Each or() param ANDs with the others. */
export function listableToday<Q extends { or(filters: string): Q }>(query: Q, today: string = dubaiToday()): Q {
  return query.or("source.neq.curated,visibility.neq.private").or(`reopens_on.is.null,reopens_on.lte.${today}`)
    .or(`source.neq.curated,${REAL_PHOTO_FILTER}`);
}

/** "Reopens 31 October 2026" while reopens_on is after today in Dubai, else null. */
export function reopensLabel(reopensOn: string | null | undefined, today: string = dubaiToday()): string | null {
  if (!reopensOn || reopensOn <= today) return null;
  const date = new Date(`${reopensOn}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : `Reopens ${DAY.format(date)}`;
}

export function sourceHost(url: string): string | null {
  try {
    const parsed = new URL(url);
    return /^https?:$/.test(parsed.protocol) ? parsed.hostname.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
}

export function venueFacts(spot: FactSpot): VenueFacts {
  const sources = (spot.facts_sources ?? []).filter((source) => typeof source?.url === "string" && sourceHost(source.url));
  const sourceFor = (label: string) => sources.find((source) => SUBJECT[label]?.test(source.fact ?? ""))?.url ?? null;
  const rows: FactRow[] = [];
  const add = (label: string, value: string | null | undefined, href?: string) => {
    if (value && value.trim()) rows.push({ label, value: value.trim(), href, source: sourceFor(label) });
  };

  const age = Math.max(spot.minimum_age ?? 0, minimumAgeForCategory(spot.category));
  // "Bring ID" is the 18+ and 21+ door check; a 14+ venue asks for no ID.
  if (age > 0) add("Age", age >= 18 ? `${age}+, bring ID` : `${age} and over`);
  if (spot.licensed != null) add("Alcohol", spot.licensed ? "Serves alcohol" : "No alcohol");
  add("Dress code", spot.dress_code);
  add("Booking", spot.reservations ? BOOKING[spot.reservations] ?? spot.reservations : null);
  add("Parking", spot.parking);
  if (spot.halal_friendly != null) add("Halal", spot.halal_friendly ? "Halal friendly" : "Not halal");
  if (spot.vegetarian_options != null) add("Vegetarian", spot.vegetarian_options ? "Vegetarian options" : "No vegetarian options listed");
  add("Spend", spot.spend_pp_aed ? spendLabel(spot.spend_pp_aed) : null);
  add("Good to know", spot.good_to_know);
  if (spot.phone) add("Phone", spot.phone, `tel:${spot.phone.replace(/[^\d+]/g, "")}`);
  const site = spot.website ? sourceHost(spot.website) : null;
  // The venue's own site is its own source.
  if (site) rows.push({ label: "Website", value: site, href: spot.website!, source: null });

  const checkedDate = spot.facts_checked_on ? new Date(`${spot.facts_checked_on}T00:00:00Z`) : null;
  const checked = rows.length > 0 && checkedDate && !Number.isNaN(checkedDate.getTime()) ? `Checked ${MONTH.format(checkedDate)}` : null;
  return { rows, checked };
}

