// The group deal: what a whole friend group answered, folded into the same
// draw the solo deal uses. Pure -- no I/O, no clock, no Math.random -- so
// the route and the tests drive it with plain values.
import { coordinatesForArea, distanceKm, DUBAI_ORIGINS, type Coordinates } from "./dubai-areas.ts";
import { avoidMatches, knownPrice, typicalSpend, vibeMatches } from "./group-prefs-rules.ts";
import {
  dealFromPool, dubaiToday, eligibleDealSpots,
  type DealConstraints, type DealRatingRow, type DealSpotRow, type SpotAffinity,
} from "./spots/match.ts";

export interface GroupPref {
  name: string;
  budgetCap: number | null;
  origin: { value: string; latitude: number; longitude: number } | null;
  vibes: string[];
  avoid: string[];
}

export interface GroupSummary {
  answered: number;
  budgetCap: number | null;
  /** The fair point (smallest worst-case trip), not a plain average. */
  centroid: Coordinates | null;
  relaxed: ("budget" | "distance")[];
}

/** The taps a friend sees. Values are the stored words; the deal matches them against venue text. */
export const GROUP_BUDGET_OPTIONS: readonly (number | null)[] = [100, 200, 350, null];
export const GROUP_VIBE_OPTIONS = [
  { value: "chill", label: "Chill" }, { value: "lively", label: "Lively" },
  { value: "romantic", label: "Romantic" }, { value: "rooftop", label: "Rooftop" },
  { value: "waterfront", label: "By the water" }, { value: "quiet", label: "Quiet" },
  { value: "outdoor", label: "Outdoors" }, { value: "upscale", label: "Upscale" },
] as const;
export const GROUP_AVOID_OPTIONS = [
  { value: "loud", label: "Loud" }, { value: "shisha", label: "Shisha" }, { value: "alcohol", label: "Alcohol" },
] as const;

/** Origin by stored value; null for "anywhere" and for anything unknown (never free text). */
export function originFor(value: string): { value: string; latitude: number; longitude: number } | null {
  const origin = DUBAI_ORIGINS.find((o) => o.value === value);
  return origin?.coordinates ? { value: origin.value, ...origin.coordinates } : null;
}
const vibeLabel = (value: string) => GROUP_VIBE_OPTIONS.find((o) => o.value === value)?.label.toLowerCase() ?? value;

/** Radius around the fair point; each step is the "wider radius" relaxation. */
const RADIUS_STEPS_KM = [20, 30, 45] as const;
const GROUP_DEAL_COUNT = 9;
const FAIRNESS_PER_KM = 0.15;
const VIBE_BOOST = 0.8;
const AVOID_PENALTY = 1.5;
const TYPICAL_OVER_CAP_PENALTY = 0.5; // an unpriced spot whose category usually costs more than the cap

const hasAnswer = (p: GroupPref) => p.budgetCap != null || p.origin != null || p.vibes.length > 0 || p.avoid.length > 0;
const lower = (words: readonly string[]) => words.map((w) => w.toLowerCase());
const origins = (prefs: readonly GroupPref[]) => prefs.flatMap((p) => (p.origin ? [p.origin] : []));

/** Distinct caps, lowest first. */
function caps(prefs: readonly GroupPref[]): number[] {
  return [...new Set(prefs.flatMap((p) => (p.budgetCap != null ? [p.budgetCap] : [])))].sort((a, b) => a - b);
}

/**
 * The point that minimises the longest trip anyone makes. Candidates are every
 * member's own origin plus the mean of them all; the mean usually wins for two
 * people (the midpoint) and a member's own area wins for a lopsided group.
 * Ties keep the earlier candidate (members sorted by value), so it is stable.
 */
function fairPoint(prefs: readonly GroupPref[]): Coordinates | null {
  const points: Coordinates[] = origins(prefs)
    .sort((a, b) => a.value.localeCompare(b.value) || a.latitude - b.latitude)
    .map(({ latitude, longitude }) => ({ latitude, longitude }));
  if (points.length === 0) return null;
  const mean = {
    latitude: points.reduce((t, p) => t + p.latitude, 0) / points.length,
    longitude: points.reduce((t, p) => t + p.longitude, 0) / points.length,
  };
  const worst = (c: Coordinates) => Math.max(...points.map((p) => distanceKm(c, p)));
  let best = points[0];
  for (const candidate of [...points, mean]) if (worst(candidate) < worst(best) - 1e-9) best = candidate;
  return best;
}

/** Words two or more people avoid: the only avoids that exclude (by rule, not text; see group-prefs-rules). */
function sharedAvoids(prefs: readonly GroupPref[]): string[] {
  const seen = new Map<string, number>();
  for (const p of prefs) for (const w of new Set(lower(p.avoid))) seen.set(w, (seen.get(w) ?? 0) + 1);
  return [...seen].filter(([, n]) => n >= 2).map(([w]) => w).sort();
}

export function summariseGroup(prefs: GroupPref[]): GroupSummary {
  const answered = prefs.filter(hasAnswer);
  return { answered: answered.length, budgetCap: caps(answered)[0] ?? null, centroid: fairPoint(answered), relaxed: [] };
}

/** How far to loosen: budgetStep 1 = second-lowest cap; radiusStep indexes RADIUS_STEPS_KM. */
export interface GroupRelax { budgetStep?: number; radiusStep?: number }

export function groupConstraints(prefs: GroupPref[], relax: GroupRelax = {}): DealConstraints {
  const answered = prefs.filter(hasAnswer);
  const origin = fairPoint(answered);
  const radiusStep = Math.min(relax.radiusStep ?? 0, RADIUS_STEPS_KM.length - 1);
  return {
    maxBudget: caps(answered)[Math.min(relax.budgetStep ?? 0, 1)] ?? caps(answered)[0] ?? null,
    origin,
    radiusKm: origin ? RADIUS_STEPS_KM[radiusStep] : null,
    // Avoids are rules over structured columns, applied in dealForGroup, not text keywords.
    avoidKeywords: [],
  };
}

function spotPoint(spot: DealSpotRow): Coordinates | null {
  return spot.latitude != null && spot.longitude != null
    ? { latitude: spot.latitude, longitude: spot.longitude }
    : coordinatesForArea(spot.area);
}

/** Longest trip to the spot among members who named a start; null when unknowable. */
function worstTrip(spot: DealSpotRow, prefs: readonly GroupPref[]): number | null {
  const to = spotPoint(spot);
  const from = origins(prefs);
  return to && from.length ? Math.max(...from.map((o) => distanceKm(o, to))) : null;
}

/** Vibe words whose rule matches the spot, mapped to how many members hold each. */
function vibeHits(spot: DealSpotRow, prefs: readonly GroupPref[]): Map<string, number> {
  const hits = new Map<string, number>();
  for (const p of prefs) for (const v of new Set(lower(p.vibes))) if (vibeMatches(v, spot)) hits.set(v, (hits.get(v) ?? 0) + 1);
  return hits;
}

/**
 * Ranks rows that already passed the filters; it never admits one. A low
 * worst trip, many vibe matches and no one's personal avoid all raise the score.
 */
export function groupAffinity(prefs: GroupPref[]): SpotAffinity {
  const answered = prefs.filter(hasAnswer);
  const cap = caps(answered)[0];
  return (spot) => {
    const trip = worstTrip(spot, answered);
    const vibes = [...vibeHits(spot, answered).values()].reduce((t, n) => t + n, 0);
    const avoided = answered.filter((p) => p.avoid.some((word) => avoidMatches(word, spot))).length;
    const typical = typicalSpend(spot.category);
    const dear = cap != null && knownPrice(spot) == null && typical != null && typical > cap;
    return (trip == null ? 0 : -trip * FAIRNESS_PER_KM) + vibes * VIBE_BOOST - avoided * AVOID_PENALTY - (dear ? TYPICAL_OVER_CAP_PENALTY : 0);
  };
}

/** At most three short claims for a card. A claim the data cannot prove is left out. */
export function fitFor(spot: DealSpotRow, prefs: GroupPref[]): string[] {
  const answered = prefs.filter(hasAnswer);
  const out: string[] = [];

  const trip = worstTrip(spot, answered);
  const withOrigin = origins(answered).length;
  if (trip != null) {
    const km = Math.max(1, Math.ceil(trip));
    out.push(withOrigin === answered.length ? `${km} km or less for all ${withOrigin}` : `${km} km or less for ${withOrigin} of ${answered.length}`);
  }

  const cap = caps(answered)[0];
  const price = knownPrice(spot);
  const typical = typicalSpend(spot.category);
  if (cap != null && price != null && price <= cap) out.push(`Fits everyone's budget (up to AED ${cap})`);
  // No price on file: only a category estimate, and worded as one.
  else if (cap != null && price == null && typical != null && typical <= cap) out.push(`Usually under AED ${cap} here`);

  const top = [...vibeHits(spot, answered)].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  if (top) {
    const [word, n] = top;
    const holder = answered.find((p) => lower(p.vibes).includes(word))?.name;
    out.push(n >= 2 ? `Matches the ${vibeLabel(word)} vibe for ${n}` : `Matches ${holder}'s ${vibeLabel(word)} vibe`);
  }
  return out.slice(0, 3);
}

/** mulberry32 over an FNV-1a hash of the seed: same seed, same stream, everywhere. */
export function seededRng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** DealOutcome's pure core plus what the "fits" copy needs. */
export type GroupDealOutcome =
  | { ids: string[]; spots: DealSpotRow[]; summary: GroupSummary; radiusKm: number | null }
  | { tooFew: true };

/**
 * Nine places in three pools of three that fit the group, or { tooFew }.
 * Under two answered people there is nothing to reconcile, so it is the plain
 * deal on `hostConstraints`. Otherwise: lowest cap and the fair-point radius
 * first, then the second-lowest cap, then wider radii, stopping at the first
 * step that can fill nine and recording what was loosened.
 */
export function dealForGroup(input: {
  pool: readonly DealSpotRow[];
  prefs: GroupPref[];
  category: string;
  seed: string;
  today?: string;
  /** The age the deal rules apply, from the server (never the body). */
  age?: number;
  ratings?: readonly DealRatingRow[];
  hostConstraints?: DealConstraints;
}): GroupDealOutcome {
  const today = input.today ?? dubaiToday();
  const pool = [...input.pool].sort((a, b) => a.id.localeCompare(b.id)); // input order never matters
  const answered = input.prefs.filter(hasAnswer);
  const base = { pool, category: input.category, count: GROUP_DEAL_COUNT, ratings: input.ratings ?? [], today, rng: seededRng(input.seed) };
  const age = input.age != null ? { age: input.age } : {};
  const finish = (ids: string[] | null, summary: GroupSummary, radiusKm: number | null): GroupDealOutcome => {
    if (!ids) return { tooFew: true };
    const byId = new Map(pool.map((s) => [s.id, s]));
    return { ids, spots: ids.map((id) => byId.get(id)!), summary, radiusKm };
  };

  if (answered.length < 2) {
    const constraints = { ...input.hostConstraints, ...age };
    return finish(dealFromPool({ ...base, constraints }), summariseGroup(answered), constraints.radiusKm ?? null);
  }

  const shared = sharedAvoids(answered);
  const keepsAvoids = (s: DealSpotRow) => !shared.some((word) => avoidMatches(word, s));
  const sorted = caps(answered);
  const budgetStep = sorted.length > 1 ? 1 : 0;
  const steps: GroupRelax[] = [{}];
  if (budgetStep) steps.push({ budgetStep });
  if (origins(answered).length > 0) for (let radiusStep = 1; radiusStep < RADIUS_STEPS_KM.length; radiusStep++) steps.push({ budgetStep, radiusStep });

  // A shared avoid excludes while the rest can still fill nine (budget and radius
  // relax first); only then is it dropped to a ranking penalty, never a deal of none.
  const attempts = shared.length ? [pool.filter(keepsAvoids), pool] : [pool];
  for (const [step, source] of attempts.flatMap((list) => steps.map((st) => [st, list] as const))) {
    const constraints = { ...groupConstraints(answered, step), ...age };
    if (!eligibleDealSpots({ pool: source, count: GROUP_DEAL_COUNT, constraints, today })) continue;
    const summary = summariseGroup(answered);
    summary.budgetCap = constraints.maxBudget ?? null;
    if (step.budgetStep) summary.relaxed.push("budget");
    if (step.radiusStep) summary.relaxed.push("distance");
    // shortlistFactor 1: the nine are the top nine by fit, not nine at random from the top eighteen.
    const ids = dealFromPool({ ...base, pool: source, constraints, embed: groupAffinity(answered), shortlistFactor: 1 });
    return finish(ids, summary, constraints.radiusKm ?? null);
  }
  return { tooFew: true };
}
