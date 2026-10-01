import { minimumAgeForCategory, prohibitedVenueReason } from "../age-policy.ts";
import { coordinatesForArea, distanceKm, type Coordinates } from "../dubai-areas.ts";
import { hasRealPhoto } from "../venue-photo.ts";

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
  // 070: a retired curated spot is visibility 'private'; a temporarily closed
  // one has reopens_on. Optional so hand-built pools (tests) stay valid.
  visibility?: string | null;
  reopens_on?: string | null;
  // P26: the deal can show real cards. Optional in the type, but a row with
  // neither is never dealt (passesHardFilters).
  photo_url?: string | null;
  photo_attribution?: string | null;
  google_place_id?: string | null;
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
  "id,name,category,area,cuisine,min_spend,vibe,description,latitude,longitude,minimum_age,visibility,reopens_on,photo_url,photo_attribution,google_place_id";

/** Today's calendar date in Dubai, as YYYY-MM-DD (reopens_on is a Dubai date). */
export function dubaiToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(now);
}

/**
 * Whether a curated spot may be dealt or listed today: not retired
 * (visibility 'private') and not closed until a later date (070). Plans that
 * already hold a closed spot still read it; this only keeps it out of new ones.
 */
export function isDealableToday(
  spot: { visibility?: string | null; reopens_on?: string | null },
  today: string = dubaiToday(),
): boolean {
  if (spot.visibility === "private") return false;
  return !spot.reopens_on || spot.reopens_on <= today;
}

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

export function searchText(spot: DealSpotRow): string {
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
 * Whole words only, so avoiding "bar" skips a wine bar but not "Barbecue" or
 * "Al Barsha". A letter or digit in any script counts as part of a word: \b
 * is ASCII-only and would misread "café" or Arabic.
 */
export function avoidMatcher(keywords: readonly string[] = []): (spot: DealSpotRow) => boolean {
  if (keywords.length === 0) return () => false;
  const words = keywords.map((keyword) => keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${words.join("|")})(?![\\p{L}\\p{N}])`, "u");
  return (spot) => pattern.test(searchText(spot));
}

/** A spot passes every hard filter (not avoid or "been", which are soft). Pure. */
function passesHardFilters(spot: DealSpotRow, constraints: DealConstraints, today: string): boolean {
  // Evaluated per deal, not in the cached pool read: the cache isn't keyed by
  // date, so a query filter there could hide a place for an hour after it reopens.
  if (!isDealableToday(spot, today)) return false;
  // Owner (2026-10-01): never deal a place that can't show a real photo. The
  // pool read already filters (lib/spots/catalogue.ts); this holds for any pool.
  if (!hasRealPhoto({ id: spot.id, photo_url: spot.photo_url ?? null, photo_attribution: null, google_place_id: spot.google_place_id })) return false;
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
  return true;
}

/** The composer's budget and radius choices; the deal preview counts each (P6). */
export const DEAL_BUDGET_OPTIONS: readonly (number | null)[] = [null, 100, 200, 350, 500];
export const DEAL_RADIUS_OPTIONS_KM: readonly (number | null)[] = [10, 20, 35, null];
export const DEAL_CATEGORIES: readonly string[] = CATEGORY_FAMILIES.flat();

/** How many spots of a pool pass the hard filters: what a deal could draw from. Pure. */
export function eligibleCount(pool: readonly DealSpotRow[], constraints: DealConstraints = {}, today: string = dubaiToday()): number {
  return pool.filter((spot) => passesHardFilters(spot, constraints, today)).length;
}

/**
 * Hard filters, then the soft avoid and "been" filters, each dropping spots
 * only while the rest can still fill the deal. Returns null when the catalog
 * cannot fill the deal. Pure.
 */
export function eligibleDealSpots(input: {
  pool: readonly DealSpotRow[];
  count: number;
  excludeIds?: readonly string[];
  been?: readonly string[];
  constraints?: DealConstraints;
  today?: string;
}): DealSpotRow[] | null {
  const constraints = input.constraints ?? {};
  const excluded = new Set(input.excludeIds ?? []);
  const today = input.today ?? dubaiToday();
  const available = input.pool.filter((spot) => !excluded.has(spot.id) && passesHardFilters(spot, constraints, today));
  if (available.length < input.count) return null;

  // Too few left without the avoided spots: keep them, and dealFromPool
  // draws them last. An avoid word must never turn a full deal into none.
  const avoided = avoidMatcher(constraints.avoidKeywords);
  const wanted = available.filter((spot) => !avoided(spot));
  const candidates = wanted.length < input.count ? available : wanted;

  const been = new Set(input.been ?? []);
  const eligible = candidates.filter((spot) => !been.has(spot.id));
  return eligible.length < input.count ? candidates : eligible; // never block on "been"
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
  today?: string;
  /** Shortlist = needed x this per tier before the shuffle. 2 (default) keeps the old draw; 1 deals strictly the top ranked. */
  shortlistFactor?: number;
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
  // An avoided spot (only here when the rest can't fill the deal) sits in a
  // tier past every category, so it fills only what is left.
  const avoided = avoidMatcher(constraints.avoidKeywords);
  const tiers = new Map<number, DealSpotRow[]>();
  for (const spot of ranked) {
    const d = categoryDistance(input.category, spot.category) + (avoided(spot) ? 100 : 0);
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
    const shortlist = tier.slice(0, Math.min(Math.ceil(needed * (input.shortlistFactor ?? 2)), tier.length));
    picked.push(...shuffle(shortlist, rng).slice(0, needed));
    drewPartial = true;
  }
  // One category that crossed the count was already shuffled above -- the
  // exact draw the flat version made. Anything else (mixed tiers, or whole
  // tiers only) is shuffled here so pools don't come out grouped.
  return (tiersUsed === 1 && drewPartial ? picked : shuffle(picked, rng)).map((s) => s.id);
}
