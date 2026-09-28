// "Because you went to X": places like the ones this account has been to,
// scored on category and area affinity over its own visits. No ML, no
// stored profile: a count, weighted toward the last 90 days.

type Place = { id: string; name: string; category: string; area: string };
type VisitLike = { visited_at: string; spot: Place | null };

export interface Suggestion<S extends Place> {
  spot: S;
  /** The visit this one is most like: same category (and area when possible), most recent. */
  because: string;
  score: number;
}

const RECENT_MS = 90 * 86_400_000;
/** Category says more about taste than area does. */
const CATEGORY_WEIGHT = 2;

export function suggestFromVisits<S extends Place>(visits: VisitLike[], candidates: S[], limit = 6, now = new Date()): Suggestion<S>[] {
  const seen = visits.filter((v): v is VisitLike & { spot: Place } => v.spot != null)
    .sort((a, b) => b.visited_at.localeCompare(a.visited_at));
  if (seen.length === 0) return [];
  const byCategory = new Map<string, number>();
  const byArea = new Map<string, number>();
  for (const visit of seen) {
    const weight = now.getTime() - new Date(visit.visited_at).getTime() < RECENT_MS ? 2 : 1;
    byCategory.set(visit.spot.category, (byCategory.get(visit.spot.category) ?? 0) + weight);
    byArea.set(visit.spot.area, (byArea.get(visit.spot.area) ?? 0) + weight);
  }
  const been = new Set(seen.map((visit) => visit.spot.id));

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

/** The categories worth querying candidates for, strongest first. */
export function topCategories(visits: VisitLike[], max = 3): string[] {
  const counts = new Map<string, number>();
  for (const visit of visits) if (visit.spot) counts.set(visit.spot.category, (counts.get(visit.spot.category) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max).map(([category]) => category);
}
