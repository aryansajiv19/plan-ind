import { supabase } from "./supabase";
import { getBeen } from "./device";
import { coordinatesForArea, distanceKm, type Coordinates } from "./dubai-areas";

export interface DealConstraints {
  maxBudget?: number | null;
  origin?: Coordinates | null;
  radiusKm?: number | null;
  vibeKeywords?: readonly string[];
  avoidKeywords?: readonly string[];
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
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

export async function dealSpotsForCategory(
  category: string,
  count = 3,
  excludeIds: readonly string[] = [],
  constraints: DealConstraints = {},
): Promise<string[] | null> {
  const family = CATEGORY_FAMILIES.find((categories) =>
    (categories as readonly string[]).includes(category),
  ) ?? [category];
  const { data: pool, error } = await supabase
    .from("spots")
    .select("id,name,category,area,cuisine,min_spend,vibe,description,latitude,longitude")
    .eq("source", "curated")
    .in("category", [...family]);
  if (error || !pool) return null;

  const excluded = new Set(excludeIds);
  const available = pool.filter((spot) => {
    if (excluded.has(spot.id)) return false;
    if (constraints.maxBudget != null && spot.min_spend > constraints.maxBudget) return false;
    if (constraints.origin && constraints.radiusKm != null) {
      const destination = spot.latitude != null && spot.longitude != null
        ? { latitude: spot.latitude, longitude: spot.longitude }
        : coordinatesForArea(spot.area);
      if (!destination || distanceKm(constraints.origin, destination) > constraints.radiusKm) return false;
    }
    const text = `${spot.name} ${spot.cuisine} ${spot.vibe} ${spot.description ?? ""}`.toLowerCase();
    if (constraints.avoidKeywords?.some((keyword) => text.includes(keyword.toLowerCase()))) return false;
    return true;
  });
  if (available.length < count) return null;

  const been = new Set(getBeen());
  let eligible = available.filter((s) => !been.has(s.id));
  if (eligible.length < count) eligible = available; // never block on "been"

  const ids = eligible.map((s) => s.id);
  const { data: rs } = await supabase
    .from("ratings")
    .select("spot_id,stars,again")
    .in("spot_id", ids);
  const agg = new Map<string, { n: number; stars: number; again: number }>();
  ((rs ?? []) as { spot_id: string; stars: number; again: boolean }[]).forEach(
    (r) => {
      const e = agg.get(r.spot_id) ?? { n: 0, stars: 0, again: 0 };
      e.n += 1;
      e.stars += r.stars;
      e.again += r.again ? 1 : 0;
      agg.set(r.spot_id, e);
    },
  );
  // Unrated spots score 3.6 — above a mediocre rating, so fresh places surface.
  const score = (id: string) => {
    const e = agg.get(id);
    return e && e.n > 0 ? e.stars / e.n + e.again / e.n : 3.6;
  };
  const ranked = [...eligible].sort((a, b) => {
    const categoryBias = Number(b.category === category) - Number(a.category === category);
    const preferenceScore = (spot: typeof a) => {
      const text = `${spot.name} ${spot.cuisine} ${spot.vibe} ${spot.description ?? ""}`.toLowerCase();
      return (constraints.vibeKeywords ?? []).reduce(
        (total, keyword) => total + (text.includes(keyword.toLowerCase()) ? 0.8 : 0),
        0,
      );
    };
    return categoryBias * 2 + preferenceScore(b) - preferenceScore(a) + score(b.id) - score(a.id);
  });
  const shortlist = ranked.slice(0, Math.min(Math.max(count * 2, count), ranked.length));
  return shuffle(shortlist)
    .slice(0, count)
    .map((s) => s.id);
}

export function dealThreeForCategory(category: string): Promise<string[] | null> {
  return dealSpotsForCategory(category, 3);
}
