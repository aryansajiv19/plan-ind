// Plan Personality: what someone's nights out say about them, derived from
// their visits (time on the Dubai clock, category, cuisine, crew size, where,
// and whether the group voted on it). Nothing stored; recomputed on read.
// Every trait carries the number behind it, so it reads as earned, not
// horoscope. Under UNLOCK_AT visits there is no personality yet: a label
// from two nights would be noise.
import { dubaiHour } from "@/lib/dubai-phase";
import { districtFor } from "@/lib/dubai-explored";

export const UNLOCK_AT = 3;

export interface PersonalityVisit {
  visitedAt: string;
  spotId: string;
  category: string | null;
  cuisine: string | null;
  area: string | null;
  crewSize: number; // including you
  fromPlan: boolean;
}

export interface Trait {
  key: string;
  title: string;
  evidence: string;
  strength: number; // 0-1, for ordering; the strongest is the headline
}

export type Personality =
  | { unlocked: false; visits: number; needed: number }
  | { unlocked: true; headline: Trait; traits: Trait[] };

const FOOD = new Set(["dinner", "cafe", "brunch", "dessert", "shisha"]);
const ACTIVE = new Set(["sports", "padel", "adventure", "outdoors", "games", "water"]);
const BEACH = new Set(["beach", "beach_club", "water"]);
const CULTURE = new Set(["culture", "movie", "escape", "live_music"]);

const pct = (n: number, of: number) => Math.round((n / of) * 100);

export function planPersonality(visits: readonly PersonalityVisit[]): Personality {
  const n = visits.length;
  if (n < UNLOCK_AT) return { unlocked: false, visits: n, needed: UNLOCK_AT - n };

  const traits: Trait[] = [];
  const share = (test: (v: PersonalityVisit) => boolean) => visits.filter(test).length / n;
  const inSet = (set: Set<string>) => (v: PersonalityVisit) => v.category !== null && set.has(v.category);

  const late = share((v) => {
    const h = dubaiHour(new Date(v.visitedAt));
    return h >= 20 || h < 4;
  });
  const early = share((v) => {
    const h = dubaiHour(new Date(v.visitedAt));
    return h >= 4 && h < 11;
  });
  if (late >= 0.5) traits.push({ key: "night-owl", title: "Night Owl", evidence: `${pct(late * n, n)}% of your nights start after 8 pm`, strength: late });
  else if (early >= 0.4) traits.push({ key: "early-riser", title: "Early Riser", evidence: `${pct(early * n, n)}% of your outings start before 11 am`, strength: early });

  const cuisines = new Set(visits.filter(inSet(FOOD)).flatMap((v) => (v.cuisine ? [v.cuisine.toLowerCase()] : [])));
  if (cuisines.size >= 3) traits.push({ key: "food", title: "Food Explorer", evidence: `You've tried ${cuisines.size} cuisines`, strength: Math.min(1, cuisines.size / 6) });

  const active = share(inSet(ACTIVE));
  if (active >= 0.4) traits.push({ key: "active", title: "Always Moving", evidence: `${pct(active * n, n)}% of your plans get you off the sofa`, strength: active });
  const beach = share(inSet(BEACH));
  if (beach >= 0.3) traits.push({ key: "beach", title: "Beach Person", evidence: `${pct(beach * n, n)}% of your days end by the water`, strength: beach });
  const culture = share(inSet(CULTURE));
  if (culture >= 0.3) traits.push({ key: "culture", title: "Culture Seeker", evidence: `${pct(culture * n, n)}% of your nights are shows, films or art`, strength: culture });

  const perPlace = new Map<string, number>();
  for (const v of visits) perPlace.set(v.spotId, (perPlace.get(v.spotId) ?? 0) + 1);
  const topRepeat = Math.max(...perPlace.values());
  if (topRepeat >= 3) traits.push({ key: "regular", title: "A Regular", evidence: `You've been back to one place ${topRepeat} times`, strength: Math.min(1, topRepeat / 5) });
  else if (n >= 4 && perPlace.size / n >= 0.8) traits.push({ key: "explorer", title: "Explorer", evidence: `${perPlace.size} different places in ${n} outings`, strength: perPlace.size / n - 0.2 });

  const crew = Math.round(visits.reduce((sum, v) => sum + v.crewSize, 0) / n);
  if (crew >= 4) traits.push({ key: "big-crew", title: "Big Crew Energy", evidence: `You usually go out in groups of ${crew}`, strength: Math.min(1, crew / 7) });
  else if (crew <= 2) traits.push({ key: "small-table", title: "Small Table", evidence: "Mostly one-on-one or just you", strength: 0.4 });

  const fromPlans = share((v) => v.fromPlan);
  if (fromPlans >= 0.5) traits.push({ key: "decider", title: "Group Decider", evidence: `${pct(fromPlans * n, n)}% of your nights were picked by a group vote`, strength: fromPlans });

  const perDistrict = new Map<string, number>();
  for (const v of visits) {
    const d = districtFor(v.area);
    if (d) perDistrict.set(d, (perDistrict.get(d) ?? 0) + 1);
  }
  const [turf, turfCount] = [...perDistrict.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  if (turf && turfCount >= 2) traits.push({ key: "turf", title: "Home Turf", evidence: `${turf}: ${turfCount} of your ${n} outings`, strength: (turfCount / n) * 0.8 });

  // Always something to say: an unlocked profile with no strong signal is "still forming".
  if (traits.length === 0) traits.push({ key: "forming", title: "Still Forming", evidence: `${n} outings in: a few more and a pattern shows`, strength: 0 });

  traits.sort((a, b) => b.strength - a.strength);
  return { unlocked: true, headline: traits[0], traits };
}
