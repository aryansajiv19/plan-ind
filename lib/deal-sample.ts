import type { RevealCard } from "@/components/DealReveal";

export interface SampleDealQuery {
  category: string;
  origin: string;
  maxBudget: number | null;
  radiusKm: number | null;
}

/**
 * P8: nine real places for a signed-out visitor's settings, or null when
 * the server can't (tooFew, 429, 503, offline) and the caller falls back to
 * its sample decks, saying so.
 */
export async function fetchSampleDeal(query: SampleDealQuery): Promise<RevealCard[] | null> {
  const params = new URLSearchParams({ category: query.category, origin: query.origin });
  if (query.maxBudget != null) params.set("maxBudget", String(query.maxBudget));
  if (query.radiusKm != null) params.set("radiusKm", String(query.radiusKm));
  try {
    const response = await fetch(`/api/spots/deal/sample?${params}`, { cache: "no-store" });
    if (!response.ok) return null;
    const body = (await response.json()) as { cards?: { name?: unknown; area?: unknown }[] | null };
    const cards = (body.cards ?? []).filter((card): card is RevealCard => typeof card.name === "string" && typeof card.area === "string");
    return cards.length === 9 ? cards : null;
  } catch {
    return null;
  }
}
