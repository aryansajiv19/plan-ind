import type { SupabaseClient } from "@supabase/supabase-js";
import { minimumAgeForCategory, prohibitedVenueReason } from "../age-policy.ts";
import { coordinatesForArea, distanceKm, type Coordinates } from "../dubai-areas.ts";

export interface DealConstraints {
  age?: number;
  maxBudget?: number | null;
  origin?: Coordinates | null;
  radiusKm?: number | null;
  vibeKeywords?: readonly string[];
  avoidKeywords?: readonly string[];
}

/** Exactly the `select()` below. Hand-written so the two cannot drift. */
export interface DealSpotRow {
  id: string;
  name: string;
  category: string;
  area: string;
  cuisine: string;
  min_spend: number;
  vibe: string;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  minimum_age: number | null;
}

export interface DealRatingRow {
  spot_id: string;
  stars: number;
  again: boolean;
}

/**
 * The RAG seam. Scores a row that has *already* passed every filter, or
 * returns null when there is nothing to score with — similarity ranks, it
 * never admits. Unused this phase: the default yields null everywhere and the
 * comparator falls back to the keyword preference score.
 *
 * When query embeddings land, the route embeds the query server-side, the
 * retrieval RPC returns a similarity per row, and this closes over that map.
 */
export type SpotAffinity = (spot: DealSpotRow) => number | null;

const noAffinity: SpotAffinity = () => null;

const SPOT_COLUMNS =
  "id,name,category,area,cuisine,min_spend,vibe,description,latitude,longitude,minimum_age";

// Deal curated spot ids for a category. Saved custom places are pinned by the
// creator explicitly and never leak into the random catalog draw.
const CATEGORY_FAMILIES = [
  ["dinner", "cafe", "brunch", "dessert", "shisha"],
  ["vibes", "nightlife", "live_music", "karaoke"],
  ["beach", "beach_club", "water"],
  ["sports", "padel", "adventure", "outdoors", "games"],
  ["movie", "culture", "wellness", "shopping", "family", "escape"],
] as const;

export function categoryFamily(category: string): string[] {
  const family = CATEGORY_FAMILIES.find((categories) =>
    (categories as readonly string[]).includes(category),
  );
  return family ? [...family] : [category];
}

function searchText(spot: DealSpotRow): string {
  return `${spot.name} ${spot.cuisine} ${spot.vibe} ${spot.description ?? ""}`.toLowerCase();
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Hard filters, then the soft "been" filter. Returns null when the catalog
 * cannot fill the deal. Pure.
 */
export function eligibleDealSpots(input: {
  pool: readonly DealSpotRow[];
  count: number;
  excludeIds?: readonly string[];
  been?: readonly string[];
  constraints?: DealConstraints;
}): DealSpotRow[] | null {
  const constraints = input.constraints ?? {};
  const excluded = new Set(input.excludeIds ?? []);
  const available = input.pool.filter((spot) => {
    if (excluded.has(spot.id)) return false;
    const minimumAge = Math.max(minimumAgeForCategory(spot.category), Number(spot.minimum_age ?? 0));
    if (constraints.age != null && constraints.age < minimumAge) return false;
    if (prohibitedVenueReason(spot.name, spot.cuisine, spot.vibe, spot.description)) return false;
    if (constraints.maxBudget != null && spot.min_spend > constraints.maxBudget) return false;
    if (constraints.origin && constraints.radiusKm != null) {
      const destination = spot.latitude != null && spot.longitude != null
        ? { latitude: spot.latitude, longitude: spot.longitude }
        : coordinatesForArea(spot.area);
      if (!destination || distanceKm(constraints.origin, destination) > constraints.radiusKm) return false;
    }
    const text = searchText(spot);
    if (constraints.avoidKeywords?.some((keyword) => text.includes(keyword.toLowerCase()))) return false;
    return true;
  });
  if (available.length < input.count) return null;

  const been = new Set(input.been ?? []);
  const eligible = available.filter((spot) => !been.has(spot.id));
  return eligible.length < input.count ? available : eligible; // never block on "been"
}

/**
 * Rank the eligible pool and draw `count` ids. Pure: every input, including
 * randomness and the affinity score, is supplied by the caller.
 */
export function dealFromPool(input: {
  category: string;
  count: number;
  pool: readonly DealSpotRow[];
  ratings: readonly DealRatingRow[];
  excludeIds?: readonly string[];
  been?: readonly string[];
  constraints?: DealConstraints;
  rng?: () => number;
  embed?: SpotAffinity;
}): string[] | null {
  const eligible = eligibleDealSpots(input);
  if (!eligible) return null;

  const constraints = input.constraints ?? {};
  const embed = input.embed ?? noAffinity;
  const agg = new Map<string, { n: number; stars: number; again: number }>();
  input.ratings.forEach((r) => {
    const e = agg.get(r.spot_id) ?? { n: 0, stars: 0, again: 0 };
    e.n += 1;
    e.stars += r.stars;
    e.again += r.again ? 1 : 0;
    agg.set(r.spot_id, e);
  });
  // Unrated spots score 3.6 — above a mediocre rating, so fresh places surface.
  const score = (id: string) => {
    const e = agg.get(id);
    return e && e.n > 0 ? e.stars / e.n + e.again / e.n : 3.6;
  };
  const keywordScore = (spot: DealSpotRow) => {
    const text = searchText(spot);
    return (constraints.vibeKeywords ?? []).reduce(
      (total, keyword) => total + (text.includes(keyword.toLowerCase()) ? 0.8 : 0),
      0,
    );
  };
  const affinity = (spot: DealSpotRow) => embed(spot) ?? keywordScore(spot);
  const ranked = [...eligible].sort((a, b) => {
    const categoryBias = Number(b.category === input.category) - Number(a.category === input.category);
    return categoryBias * 2 + affinity(b) - affinity(a) + score(b.id) - score(a.id);
  });
  const shortlist = ranked.slice(0, Math.min(Math.max(input.count * 2, input.count), ranked.length));
  return shuffle(shortlist, input.rng ?? Math.random)
    .slice(0, input.count)
    .map((s) => s.id);
}

type Db = SupabaseClient;

/**
 * The I/O shell: two reads under the caller's RLS, then the pure draw. The
 * ratings read is scoped to the spots that survived filtering, exactly as the
 * browser version was.
 */
export async function dealSpotIds(db: Db, input: {
  category: string;
  count: number;
  excludeIds?: readonly string[];
  been?: readonly string[];
  constraints?: DealConstraints;
  rng?: () => number;
  embed?: SpotAffinity;
}): Promise<string[] | null> {
  const { data, error } = await db
    .from("spots")
    .select(SPOT_COLUMNS)
    .eq("source", "curated")
    .in("category", categoryFamily(input.category));
  if (error || !data) return null;

  const pool = data as unknown as DealSpotRow[];
  const eligible = eligibleDealSpots({ ...input, pool });
  if (!eligible) return null;

  const { data: rated } = await db
    .from("ratings")
    .select("spot_id,stars,again")
    .in("spot_id", eligible.map((spot) => spot.id));

  return dealFromPool({ ...input, pool, ratings: (rated ?? []) as unknown as DealRatingRow[] });
}
