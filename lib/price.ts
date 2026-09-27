import type { Spot } from "@/lib/types";

// A place's price, only where it is a real fact (house rule 1: no invented
// data). Every custom place stores min_spend 0 and a forced price_band '$$'
// (the column is NOT NULL), and no place is "from AED 0", so neither shows.

/** The minimum spend per person, or null when there is none to state. */
export function knownMinSpend(spot: Pick<Spot, "min_spend">): number | null {
  return spot.min_spend > 0 ? spot.min_spend : null;
}

/** The price band, or null for a custom place that never really had one. */
export function knownPriceBand(spot: Pick<Spot, "price_band" | "source">): string | null {
  return spot.source === "custom" ? null : spot.price_band || null;
}

/** The short card label: the spend when known, else a curated band, else nothing. */
export function priceLabel(spot: Pick<Spot, "min_spend" | "price_band" | "source">): string | null {
  const spend = knownMinSpend(spot);
  return spend != null ? `AED ${spend} pp` : knownPriceBand(spot);
}
