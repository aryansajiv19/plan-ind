// The group deal's vocabulary as rules over what the catalogue actually holds.
// Structure first (category, price, licensed), venue text second: free text is
// sparse (a plain "chill" search hit 1 of 452 live spots), so a vibe that only
// read text would be a no-op. Every rule is pure and false when the data is
// unknown -- an unknown is never a match and never a claim.
import type { DealSpotRow } from "./spots/match.ts";
import { searchText } from "./spots/match.ts";

const inSet = (...categories: string[]) => {
  const set = new Set(categories);
  return (spot: DealSpotRow) => set.has(spot.category);
};

/** A known price only: min_spend 0 is how an unpriced row looks. */
export const knownPrice = (spot: DealSpotRow): number | null =>
  Number.isFinite(spot.min_spend) && spot.min_spend > 0 ? spot.min_spend : null;

const fullText = (spot: DealSpotRow) => `${searchText(spot)} ${spot.area.toLowerCase()}`;
const words = (re: RegExp) => (spot: DealSpotRow) => re.test(fullText(spot));

const lively = inSet("nightlife", "live_music", "karaoke", "beach_club", "games");
const rooftop = words(/\brooftop\b/);
const waterfront = words(/\b(waterfront|waterside|by the water|sea ?view|seaside|marina|beach|creek|lagoon|canal|corniche|harbou?r)\b/);
const upscale = (spot: DealSpotRow) => spot.price_band === "$$$" || (knownPrice(spot) ?? 0) >= 250;
const outdoorText = words(/\b(outdoors?|terrace|garden|open[- ]air)\b/);
const outdoorCategory = inSet("outdoors", "beach", "water", "padel", "sports", "adventure");

/** One table: a vibe word is what a friend taps; the rule says which venues it means. */
export const VIBE_RULES: Record<string, (spot: DealSpotRow) => boolean> = {
  chill: inSet("cafe", "beach", "outdoors", "wellness", "shisha", "dessert"),
  lively,
  quiet: inSet("cafe", "culture", "wellness"),
  outdoor: (spot) => outdoorCategory(spot) || outdoorText(spot),
  rooftop,
  waterfront,
  upscale,
  romantic: (spot) => (spot.category === "dinner" || spot.category === "vibes") && (upscale(spot) || rooftop(spot) || waterfront(spot)),
};

/** What a friend wants to dodge. `licensed` null/absent never counts as alcohol. */
export const AVOID_RULES: Record<string, (spot: DealSpotRow) => boolean> = {
  loud: lively,
  shisha: (spot) => spot.category === "shisha" || words(/\bshisha\b/)(spot),
  alcohol: (spot) => spot.licensed === true,
};

export const vibeMatches = (value: string, spot: DealSpotRow): boolean => VIBE_RULES[value.toLowerCase()]?.(spot) ?? false;
export const avoidMatches = (value: string, spot: DealSpotRow): boolean => AVOID_RULES[value.toLowerCase()]?.(spot) ?? false;

/**
 * ESTIMATE, not data: typical minimum spend per category in AED, read off the
 * live catalogue's priced rows (about 70 of 452). Used only to nudge ranking
 * and for a claim worded "Usually", never "fits". Unlisted categories: none.
 */
export const TYPICAL_SPEND: Record<string, number> = {
  cafe: 70, sports: 75, movie: 65, padel: 100, culture: 105, games: 100, family: 130, shopping: 150,
  shisha: 190, beach: 220, dinner: 220, vibes: 230, nightlife: 275, brunch: 335, beach_club: 350,
  adventure: 360, escape: 550,
};
export const typicalSpend = (category: string): number | null => TYPICAL_SPEND[category] ?? null;
