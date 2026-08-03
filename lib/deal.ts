import { supabase } from "./supabase";
import { getBeen } from "./device";

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Deal three spot ids for a category. The whole point: nobody researches.
// Prefer spots this device hasn't been dealt yet, rank the rest by how past
// groups rated them, then take three from the top shortlist for variety.
// Returns null if the category doesn't have at least three spots.
export async function dealThreeForCategory(
  category: string,
): Promise<string[] | null> {
  const { data: pool, error } = await supabase
    .from("spots")
    .select("id")
    .eq("category", category);
  if (error || !pool || pool.length < 3) return null;

  const been = new Set(getBeen());
  let eligible = pool.filter((s) => !been.has(s.id));
  if (eligible.length < 3) eligible = pool; // never block on "been"

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
  const ranked = [...eligible].sort((a, b) => score(b.id) - score(a.id));
  const shortlist = ranked.slice(0, Math.min(6, Math.max(3, ranked.length)));
  return shuffle(shortlist)
    .slice(0, 3)
    .map((s) => s.id);
}
