// The deal's I/O shell (split from match.ts, which stays pure): load the
// pool, read ratings under the caller's RLS, then the pure draw.
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "../supabase/paginate.ts";
import { hasRealPhoto } from "../venue-photo.ts";
import { dealFromPool, eligibleDealSpots, type DealConstraints, type DealRatingRow, type DealSpotRow, type SpotAffinity } from "./match.ts";

type Db = SupabaseClient;

/**
 * Loads every curated spot in `category`'s family: complete, or null on any
 * failure (never a partial pool). The route passes the cached, sessionless
 * loader from lib/spots/catalogue.ts; tests pass a fixture.
 */
export type DealPoolLoader = (category: string) => Promise<readonly DealSpotRow[] | null>;

/**
 * The I/O shell: the pool (curated, identical for every caller -- cacheable),
 * then the ratings read under the caller's RLS (per-user -- never cached),
 * then the pure draw. Every per-caller filter -- age, budget, radius,
 * exclusions, "been" -- runs here on every request, AFTER the pool is loaded,
 * so a shared cached pool cannot carry one caller's eligibility to another.
 * The ratings read is scoped to the spots that survived filtering.
 */
/**
 * Why a deal did or didn't happen. `tooFew`: the pool honestly can't fill the
 * count (the host should widen a limit). `unavailable`: a read failed, so
 * nothing is known about the pool -- never report that as `tooFew`, or a
 * database blip tells the host to raise their budget.
 */
export type DealOutcome = { ids: string[]; spots: DealSpotRow[] } | { tooFew: true } | { unavailable: true };

/** What the deal reveal shows per card (P26). A photo always travels with its credit (licence). */
export interface DealCard {
  id: string;
  name: string;
  area: string;
  min_spend: number;
  photo_url: string | null;
  photo_attribution: string | null;
  google_place_id: string | null;
}
export function dealCard(spot: DealSpotRow): DealCard {
  return {
    id: spot.id, name: spot.name, area: spot.area, min_spend: spot.min_spend,
    photo_url: spot.photo_url ?? null, photo_attribution: spot.photo_attribution ?? null,
    google_place_id: spot.google_place_id ?? null,
  };
}

export async function dealSpotIds(db: Db, input: {
  category: string;
  count: number;
  excludeIds?: readonly string[];
  been?: readonly string[];
  constraints?: DealConstraints;
  rng?: () => number;
  embed?: SpotAffinity;
}, loadPool: DealPoolLoader): Promise<DealOutcome> {
  const data = await loadPool(input.category);
  if (!data) return { unavailable: true };

  const pool = data;
  const eligible = eligibleDealSpots({ ...input, pool });
  if (!eligible) return { tooFew: true };

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
    if (!rows) return { unavailable: true }; // ranking on a partial read is worse than no deal
    ratings.push(...rows);
  }

  const dealt = dealFromPool({ ...input, pool, ratings });
  if (!dealt) return { tooFew: true };
  const byId = new Map(pool.map((spot) => [spot.id, spot]));
  return { ids: dealt, spots: dealt.map((id) => byId.get(id)!) }; // spots[i] is ids[i]
}

/**
 * Before a plan is created from client-sent ids: is any of them a curated
 * place that can't show a real photo (owner, 2026-10-01)? The deal never
 * offers one; this stops a hand-built request. Custom places are the host's
 * own and pass; ids the caller can't read are left to the RPC to refuse.
 */
export async function photoCheck(db: Db, ids: readonly string[]): Promise<"ok" | "photoless" | "unavailable"> {
  const { data, error } = await db.from("spots").select("id, source, photo_url, google_place_id").in("id", [...ids]);
  if (error || !data) return "unavailable";
  return (data as { id: string; source: string; photo_url: string | null; google_place_id: string | null }[])
    .some((row) => row.source === "curated" && !hasRealPhoto({ ...row, photo_attribution: null })) ? "photoless" : "ok";
}
