// Pure helpers for reads that combine the shared curated catalogue (cached,
// identical for every caller — lib/spots/catalogue.ts) with rows that are
// per-user under RLS (custom, community and plan-shared spots). No I/O here.

/**
 * The /home Discover grid used to be one query: every spot this user may
 * read, `order by name`, `limit n`. It is now two inputs — the cached curated
 * top-n by name and a live read of this user's non-curated top-n by name —
 * and this rebuilds the same answer: the union, ordered by name (id as the
 * tiebreak, so equal names cannot reorder between requests), cut to `limit`.
 * Taking n from each side is enough: the union's top n can never need an
 * n+1th row from either input.
 *
 * An id present in both keeps the curated copy (it is the same row; a
 * non-curated read filters on source, so this is belt and braces).
 */
export function mergeDiscoverSpots<T extends { id: string; name: string }>(
  curated: readonly T[],
  others: readonly T[],
  limit: number,
): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const spot of [...curated, ...others]) {
    if (seen.has(spot.id)) continue;
    seen.add(spot.id);
    merged.push(spot);
  }
  merged.sort((a, b) => compareName(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return merged.slice(0, Math.max(0, limit));
}

// Case-insensitive first, so "bla" and "Boa" sort the way a reader expects
// (and the way an en_US database collation would), then exact, so the order
// is total.
function compareName(a: string, b: string): number {
  return a.localeCompare(b, "en", { sensitivity: "base" }) || (a < b ? -1 : a > b ? 1 : 0);
}
