// "Because you went to X": places like the ones this account has been to,
// scored on category and area affinity over its own visits. No ML, no
// stored profile: a count, weighted toward the last 90 days, and by how the
// account ranked each place (085): loved counts three times, fine or
// unranked once, meh not at all. So a kind of place you only ever found meh
// is never suggested, and a loved one leads.

type Place = { id: string; name: string; category: string; area: string };
type VisitLike = { visited_at: string; spot: Place | null };
/** How the account ranked a place (my_ranking); absent = not ranked. */
export type RankedPlace = { spot_id: string; bucket: "loved" | "fine" | "meh" };

const BUCKET_WEIGHT = { loved: 3, fine: 1, meh: 0 } as const;
const tasteOf = (rankings: readonly RankedPlace[]) => {
  const bucket = new Map(rankings.map((r) => [r.spot_id, r.bucket]));
  return (spotId: string) => { const b = bucket.get(spotId); return b ? BUCKET_WEIGHT[b] : 1; };
};

export interface Suggestion<S extends Place> {
  spot: S;
  /** The visit this one is most like: same category (and area when possible), most recent. */
  because: string;
  score: number;
}

const RECENT_MS = 90 * 86_400_000;
/** Category says more about taste than area does. */
const CATEGORY_WEIGHT = 2;

export function suggestFromVisits<S extends Place>(visits: VisitLike[], candidates: S[], limit = 6, now = new Date(),
  rankings: readonly RankedPlace[] = []): Suggestion<S>[] {
  const taste = tasteOf(rankings);
  const all = visits.filter((v): v is VisitLike & { spot: Place } => v.spot != null);
  const been = new Set(all.map((visit) => visit.spot.id));
  // Most loved first, then most recent: the order the reason is picked in.
  const seen = all.filter((visit) => taste(visit.spot.id) > 0)
    .sort((a, b) => taste(b.spot.id) - taste(a.spot.id) || b.visited_at.localeCompare(a.visited_at));
  if (seen.length === 0) return [];
  const byCategory = new Map<string, number>();
  const byArea = new Map<string, number>();
  for (const visit of seen) {
    const weight = (now.getTime() - new Date(visit.visited_at).getTime() < RECENT_MS ? 2 : 1) * taste(visit.spot.id);
    byCategory.set(visit.spot.category, (byCategory.get(visit.spot.category) ?? 0) + weight);
    byArea.set(visit.spot.area, (byArea.get(visit.spot.area) ?? 0) + weight);
  }

  return candidates
    .filter((spot) => !been.has(spot.id) && byCategory.has(spot.category))
    .map((spot) => {
      const like = seen.find((v) => v.spot.category === spot.category && v.spot.area === spot.area)
        ?? seen.find((v) => v.spot.category === spot.category)!;
      return {
        spot,
        because: like.spot.name,
        score: CATEGORY_WEIGHT * byCategory.get(spot.category)! + (byArea.get(spot.area) ?? 0),
      };
    })
    .sort((a, b) => b.score - a.score || a.spot.name.localeCompare(b.spot.name))
    .slice(0, limit);
}

/** The categories worth querying candidates for, strongest first (meh-only ones never). */
export function topCategories(visits: VisitLike[], max = 3, rankings: readonly RankedPlace[] = []): string[] {
  const taste = tasteOf(rankings);
  const counts = new Map<string, number>();
  for (const visit of visits) {
    if (visit.spot && taste(visit.spot.id) > 0) counts.set(visit.spot.category, (counts.get(visit.spot.category) ?? 0) + taste(visit.spot.id));
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max).map(([category]) => category);
}
