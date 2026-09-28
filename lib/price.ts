import type { Spot } from "@/lib/types";

const aed = (n: number) => `AED ${n.toLocaleString("en-US")}`;

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

/**
 * Spend per person from 070's checked fact ("99-199", "500+", "365", "0"),
 * else the known minimum spend. Null when neither is a real fact.
 */
export function spendPerHead(spot: Pick<Spot, "min_spend" | "spend_pp_aed">): { low: number; high: number | null; kind: "range" | "plus" | "minimum" } | null {
  const fact = spot.spend_pp_aed?.trim().match(/^(\d+)(?:\s*-\s*(\d+)|(\+))?$/);
  if (fact) {
    const low = Number(fact[1]);
    return { low, high: fact[2] ? Number(fact[2]) : fact[3] ? null : low, kind: fact[3] ? "plus" : "range" };
  }
  const min = knownMinSpend(spot);
  return min != null ? { low: min, high: null, kind: "minimum" } : null;
}

/** "About AED 99–199 each · AED 495–995 for the 5 coming", or null. No payment, just the sum. */
export function groupCostLine(spot: Pick<Spot, "min_spend" | "spend_pp_aed">, coming: number): string | null {
  const spend = spendPerHead(spot);
  if (!spend) return null;
  if (spend.kind === "range" && spend.low === 0 && spend.high === 0) return "Free to get in";
  const each = spend.kind === "minimum" ? `Minimum spend ${aed(spend.low)} each`
    : spend.kind === "plus" ? `${aed(spend.low)}+ each`
      : spend.high !== spend.low ? `About ${aed(spend.low)}–${spend.high!.toLocaleString("en-US")} each` : `About ${aed(spend.low)} each`;
  if (coming < 2) return each;
  const group = spend.kind === "minimum" ? `at least ${aed(spend.low * coming)}`
    : spend.kind === "plus" ? `${aed(spend.low * coming)}+`
      : spend.high !== spend.low ? `${aed(spend.low * coming)}–${(spend.high! * coming).toLocaleString("en-US")}` : aed(spend.low * coming);
  return `${each} · ${group} for the ${coming} coming`;
}
