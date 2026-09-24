import type { SupabaseClient } from "@supabase/supabase-js";
import { minimumAgeForCategory, prohibitedVenueReason } from "../age-policy.ts";
import { coordinatesForArea, distanceKm, type Coordinates } from "../dubai-areas.ts";
import { fetchAllRows } from "../supabase/paginate.ts";

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

export const DEAL_SPOT_COLUMNS =
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

// Within the food family, how close each category is to the one asked for.
// A brunch plan short of brunch places should borrow cafes before dinner, and
// dessert and shisha last — the family used to be drawn from as one flat pool,
// so a "Saturday brunch" could be dealt, and even won by, a dessert bar.
const NEAREST: Record<string, readonly string[]> = {
  brunch: ["brunch", "cafe", "dinner", "dessert", "shisha"],
  cafe: ["cafe", "brunch", "dessert", "dinner", "shisha"],
  dinner: ["dinner", "brunch", "cafe", "dessert", "shisha"],
  dessert: ["dessert", "cafe", "brunch", "dinner", "shisha"],
  shisha: ["shisha", "cafe", "dinner", "dessert", "brunch"],
};

/** 0 for the category asked for, higher for further away. */
function categoryDistance(asked: string, spotCategory: string): number {
  if (spotCategory === asked) return 0;
  const order = NEAREST[asked];
  const index = order ? order.indexOf(spotCategory) : -1;
  return index > 0 ? index : 1;
}

export function isKnownCategory(category: string): boolean {
  return CATEGORY_FAMILIES.some((categories) => (categories as readonly string[]).includes(category));
}

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
  const rng = input.rng ?? Math.random;
  const ranked = [...eligible].sort((a, b) => affinity(b) - affinity(a) + score(b.id) - score(a.id));

  // Fill from the nearest category outward: whole tiers while they fit, then
  // the usual shortlist-and-shuffle inside the tier that crosses the count.
  // The old single sort gave the exact category a +2 bias and then shuffled
  // the top 2x count, which on a family of ~20 spots erased the bias entirely.
  const tiers = new Map<number, DealSpotRow[]>();
  for (const spot of ranked) {
    const d = categoryDistance(input.category, spot.category);
    tiers.set(d, [...(tiers.get(d) ?? []), spot]);
  }
  const picked: DealSpotRow[] = [];
  let tiersUsed = 0;
  let drewPartial = false;
  for (const d of [...tiers.keys()].sort((x, y) => x - y)) {
    const needed = input.count - picked.length;
    if (needed <= 0) break;
    const tier = tiers.get(d)!;
    tiersUsed += 1;
    if (tier.length <= needed) { picked.push(...tier); continue; }
    const shortlist = tier.slice(0, Math.min(needed * 2, tier.length));
    picked.push(...shuffle(shortlist, rng).slice(0, needed));
    drewPartial = true;
  }
  // One category that crossed the count was already shuffled above -- the
  // exact draw the flat version made. Anything else (mixed tiers, or whole
  // tiers only) is shuffled here so pools don't come out grouped.
  return (tiersUsed === 1 && drewPartial ? picked : shuffle(picked, rng)).map((s) => s.id);
}

type Db = SupabaseClient;

/**
 * Loads every curated spot in `category`'s family: complete, or null on any
 * failure (never a partial pool). The route passes the cached, sessionless
 * loader from lib/spots/catalogue.ts; tests pass a fixture.
 */
export type DealPoolLoader = (category: string) => Promise<readonly DealSpotRow[] | null>;

/**
 * The live, uncached pool read under `db`'s RLS -- the default loader.
 *
 * Paged: PostgREST silently caps a table read at 1000 rows -- no error, and
 * no limit clause here to hint at it. Measured at 5082 curated spots, a
 * dinner-family deal matched 1109 rows and received 1000, so every plan was
 * dealt from the oldest 1000 spots of the family and the rest of the
 * catalogue was undealable. That is the core product loop quietly ignoring
 * most of the catalogue, not a slow query.
 */
export function livePoolLoader(db: Db): DealPoolLoader {
  return (category) => fetchAllRows<DealSpotRow>(
    (from, to) => db.from("spots").select(DEAL_SPOT_COLUMNS)
      .eq("source", "curated")
      .in("category", categoryFamily(category))
      .order("id").range(from, to) as unknown as PromiseLike<{ data: DealSpotRow[] | null; error: unknown }>,
    "dealSpotIds.pool",
  );
}

/**
 * The I/O shell: the pool (curated, identical for every caller -- cacheable),
 * then the ratings read under the caller's RLS (per-user -- never cached),
 * then the pure draw. Every per-caller filter -- age, budget, radius,
 * exclusions, "been" -- runs here on every request, AFTER the pool is loaded,
 * so a shared cached pool cannot carry one caller's eligibility to another.
 * The ratings read is scoped to the spots that survived filtering.
 */
export async function dealSpotIds(db: Db, input: {
  category: string;
  count: number;
  excludeIds?: readonly string[];
  been?: readonly string[];
  constraints?: DealConstraints;
  rng?: () => number;
  embed?: SpotAffinity;
}, loadPool: DealPoolLoader = livePoolLoader(db)): Promise<string[] | null> {
  const data = await loadPool(input.category);
  if (!data) return null;

  const pool = data;
  const eligible = eligibleDealSpots({ ...input, pool });
  if (!eligible) return null;

  // Chunked, paged, and fails hard -- none of which is fussiness here.
  //
  // A short or failed ratings read does NOT degrade to "no ranking": an
  // unrated spot scores 3.6 (above a mediocre rating, so new places surface),
  // so every spot whose ratings fell off the end gets silently PROMOTED
  // above genuinely well-rated ones. Two identical plans dealt a second
  // apart would return different winners and both would look correct.
  //
  // Two ways it could go short. The 1000-row cap applies here exactly as it
  // does above. And `.in()` serialises every id into the query string, so a
  // few thousand eligible spots produce a URL long enough to return HTTP
  // 414 -- which, discarded, reads as "nobody has rated anything".
  const ids = eligible.map((spot) => spot.id);
  const CHUNK = 100; // ~3.7KB of uuids per request, far short of any URL limit
  const ratings: DealRatingRow[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const rows = await fetchAllRows<DealRatingRow>(
      (from, to) => db.from("ratings").select("spot_id,stars,again")
        .in("spot_id", slice).order("spot_id").range(from, to) as unknown as PromiseLike<{ data: DealRatingRow[] | null; error: unknown }>,
      "dealSpotIds.ratings",
    );
    if (!rows) return null; // ranking on a partial read is worse than no deal
    ratings.push(...rows);
  }

  return dealFromPool({ ...input, pool, ratings });
}
