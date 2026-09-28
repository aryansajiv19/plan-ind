import "server-only";
import { MIN_ACCOUNT_AGE } from "@/lib/age-policy";
import { coordinatesForArea } from "@/lib/dubai-areas";
import { curatedDealPool } from "@/lib/spots/catalogue";
import { dealFromPool, dubaiToday, type DealSpotRow } from "@/lib/spots/match";
import type { PriceBand, Spot } from "@/lib/types";
import { SAMPLE_PLAN, SAMPLE_POOLS } from "@/components/demo/sampleDecision";

// /demo/vote's decks: one per kind of night the sample offers. Dinner is the
// fixture (always there, real venues with directions); the others are dealt
// from the same cached, read-only curated catalogue the landing and the P8
// preview read, under the strictest account age and the sample plan's own
// budget and radius, so the constraints the vote screen states are true.
// A kind whose read fails or can't fill nine is left out, never faked.

export interface DemoDeck {
  key: string;
  label: string;
  title: string;
  pools: Spot[][];
}

// A deal draws from the asked category's whole family (lib/spots/match.ts),
// and no single category holds nine, so each kind is named for its family.
// Only families a signed-out (youngest) visitor can see nine of: after-dark
// and beach clubs are 21+ and never deal here.
const KINDS = [
  { key: "brunch", label: "Brunch and coffee", title: "Where's brunch?" },
  { key: "sports", label: "Move and play", title: "What are we playing?" },
  { key: "culture", label: "Culture and reset", title: "What should we go see?" },
] as const;

const origin = coordinatesForArea(SAMPLE_PLAN.originLabel);
const constraints = { age: MIN_ACCOUNT_AGE, maxBudget: SAMPLE_PLAN.budgetPerPerson, origin, radiusKm: SAMPLE_PLAN.radiusKm };

/** A deal row as a vote card. What the row doesn't carry stays unknown, never invented. */
function asSpot(row: DealSpotRow): Spot {
  return {
    ...row,
    minimum_age: row.minimum_age ?? 0,
    // Unknown: priceLabel shows the min spend, and an empty band shows nothing.
    price_band: "" as PriceBand,
    open_till: "",
    photo_url: row.photo_url ?? null,
    photo_source: null,
    photo_attribution: row.photo_attribution ?? null,
    // Our own photos only: a Google photo costs the daily cap and, past a
    // visitor's limit, answers 429. Without one the card shows its no-photo design.
    google_place_id: null,
    booking_url: null,
    source: "curated",
    visibility: "community",
    address: null,
  };
}

async function deckFor({ key, label, title }: (typeof KINDS)[number]): Promise<DemoDeck | null> {
  const pool = await curatedDealPool(key).catch(() => null);
  if (!pool?.length) return null;
  const deal = (from: readonly DealSpotRow[]) => dealFromPool({ category: key, count: 9, pool: from, ratings: [], constraints, today: dubaiToday() });
  // Self-hosted photos first, so demo traffic doesn't spend the daily Google photo cap.
  const ids = deal(pool.filter((spot) => spot.photo_url)) ?? deal(pool);
  if (!ids) return null;
  const byId = new Map(pool.map((spot) => [spot.id, spot]));
  const spots = ids.map((id) => asSpot(byId.get(id)!));
  return { key, label, title, pools: [spots.slice(0, 3), spots.slice(3, 6), spots.slice(6, 9)] };
}

export async function loadDemoDecks(): Promise<DemoDeck[]> {
  const dealt = await Promise.all(KINDS.map(deckFor));
  const dinner: DemoDeck = { key: "dinner", label: "Dinner", title: SAMPLE_PLAN.title, pools: SAMPLE_POOLS.map((pool) => [...pool]) };
  return [dinner, ...dealt.filter((deck): deck is DemoDeck => deck !== null)];
}
