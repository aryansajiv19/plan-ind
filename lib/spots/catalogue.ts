import "server-only";
import { unstable_cache } from "next/cache";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { log, serializeError } from "@/lib/observability/log";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { fetchAllRows } from "@/lib/supabase/paginate";
import { categoryFamily, DEAL_SPOT_COLUMNS, type DealSpotRow } from "./match";

// ── The curated catalogue, cached across requests ────────────────────────
//
// Curated spots (~82 rows) change only through migrations and backfills, but
// were re-read from Supabase on every landing view, every /home view and every
// deal. These reads are now served from Next's data cache.
//
// WHAT MAY BE CACHED HERE — the rule that keeps this safe:
//   Only rows that are identical for every caller. Every read below uses a
//   SESSIONLESS anon client (no cookies, no user token), so RLS applies the
//   anon policy "read curated spots anonymously" (source = 'curated') and the
//   051 column grants — the result cannot depend on who asked, and cannot
//   contain a custom, community or plan-shared spot. Never pass a user's
//   client into this file, and never cache a per-user read here.
//   Age / budget / "been" / exclusion filtering is NOT done here: callers
//   apply it per request to the cached rows (eligibleDealSpots for the deal;
//   the client-side age gate for the Discover grid, which already received
//   rows from every age band before this cache existed).
//
// FRESHNESS / INVALIDATION: `revalidate: 3600` (stale-while-revalidate: the
// first request after an hour gets the old rows and refreshes them in the
// background). The deployment id is part of the key, so every deploy starts
// cold — ship a catalogue migration/backfill together with (or followed by) a
// deploy and it is visible immediately; otherwise within the hour. The tag
// CURATED_CATALOGUE_TAG exists so a future trusted server path could call
// revalidateTag(CURATED_CATALOGUE_TAG, "max"); deliberately no route does
// that today (there is no admin surface, and an unauthenticated one would be
// a free cache-busting DoS).
//
// FAILURES ARE NEVER CACHED: a failed read throws inside the cached function
// (unstable_cache stores only resolved values), and the exported wrappers
// turn that into the same "error" result each caller already handled.
//
// Next 16 note: `use cache` needs `cacheComponents`, which changes rendering
// semantics app-wide; unstable_cache is the supported previous-model API and
// works in the dynamic (nonce-CSP) pages and route handlers this app has.
// Entries over 2MB are not stored (Next warns and the read runs uncached) —
// ~3k curated rows per entry; fine at 82, revisit if the catalogue grows.

export const CURATED_CATALOGUE_TAG = "spots:curated";
const REVALIDATE_SECONDS = 3600;
const DEPLOYMENT = process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "local";

let anonClient: SupabaseClient | null = null;
function anon(): SupabaseClient {
  if (!anonClient) {
    const { url, key } = getSupabaseConfig();
    anonClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return anonClient;
}

function cached<A extends unknown[], R>(name: string, fn: (...args: A) => Promise<R>) {
  return unstable_cache(fn, [name, DEPLOYMENT], {
    revalidate: REVALIDATE_SECONDS,
    tags: [CURATED_CATALOGUE_TAG],
  });
}

// ── Landing page wall ────────────────────────────────────────────────────

export interface WallSpotRow {
  id: string; name: string; area: string; min_spend: number; vibe: string;
  photo_url: string | null; photo_attribution: string | null; category: string; price_band: string;
}

const readWall = cached("curated-wall", async (size: number): Promise<WallSpotRow[]> => {
  const { data, error } = await anon()
    .from("spots")
    .select("id, name, area, min_spend, vibe, photo_url, photo_attribution, category, price_band")
    .eq("source", "curated")
    .order("photo_url", { nullsFirst: false })
    .order("name")
    .order("id")
    .limit(size);
  if (error || !data) throw new CatalogueReadError("wall", error);
  return data as WallSpotRow[];
});

// ── /home Discover: the curated half ─────────────────────────────────────

/** Columns the Discover grid reads (see app/home/page.tsx). */
export const DISCOVER_COLUMNS =
  "id, name, category, area, cuisine, price_band, min_spend, open_till, vibe, photo_url, photo_attribution, description, minimum_age";

export interface DiscoverSpotRow {
  id: string; name: string; category: string; area: string; cuisine: string; price_band: string;
  min_spend: number; open_till: string; vibe: string; photo_url: string | null;
  photo_attribution: string | null; description: string | null; minimum_age: number | null;
}

const readDiscover = cached("curated-discover", async (limit: number): Promise<DiscoverSpotRow[]> => {
  const { data, error } = await anon()
    .from("spots")
    .select(DISCOVER_COLUMNS)
    .eq("source", "curated")
    .order("name")
    .order("id")
    .limit(limit);
  if (error || !data) throw new CatalogueReadError("discover", error);
  return data as unknown as DiscoverSpotRow[];
});

// ── Deal pool: one category family ───────────────────────────────────────

const readFamily = cached("curated-deal-family", async (family: string[]): Promise<DealSpotRow[]> => {
  const rows = await fetchAllRows<DealSpotRow>(
    (from, to) => anon().from("spots").select(DEAL_SPOT_COLUMNS)
      .eq("source", "curated")
      .in("category", family)
      .order("id").range(from, to) as unknown as PromiseLike<{ data: DealSpotRow[] | null; error: unknown }>,
    "catalogue.dealFamily",
  );
  // fetchAllRows has already logged the cause; null means "incomplete".
  if (!rows) throw new CatalogueReadError("deal-family", null);
  return rows;
});

class CatalogueReadError extends Error {
  constructor(which: string, cause: unknown) {
    super(`curated catalogue read failed: ${which}`);
    this.cause = cause;
  }
}

async function settle<T>(which: string, read: () => Promise<T>): Promise<{ data: T; error: null } | { data: null; error: string }> {
  try {
    return { data: await read(), error: null };
  } catch (error) {
    const cause = error instanceof CatalogueReadError ? error.cause : error;
    log("error", "catalogue.read_failed", { which, ...serializeError(cause) });
    return { data: null, error: which };
  }
}

/** The front-door wall: `size` curated rows, photos first, by name. */
export function curatedWall(size: number) {
  return settle("wall", () => readWall(size));
}

/** Curated top-`limit` by name, for merging with the user's own rows. */
export function curatedDiscover(limit: number) {
  return settle("discover", () => readDiscover(limit));
}

/**
 * Every curated spot in `category`'s family, complete or null — the same
 * contract as fetchAllRows. Plugs into dealSpotIds as its pool loader.
 */
export async function curatedDealPool(category: string): Promise<DealSpotRow[] | null> {
  // Sorted so "dinner" and "cafe" (same family) share one cache entry.
  const family = [...categoryFamily(category)].sort();
  return (await settle("deal-family", () => readFamily(family))).data;
}
