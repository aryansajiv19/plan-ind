// Catalogue growth from OpenStreetMap (migration 089). Pure: the rules that
// turn Overpass elements into curated spots, so they can be unit-tested and
// re-run. OSM data is ODbL: attributed on /credits. Nothing here reads or
// stores anything from Google; place ids are matched later, separately.

import { DISTRICTS, districtFor } from "@/lib/dubai-explored";
import { AREA_CENTRES, distanceKm, type Coordinates } from "@/lib/dubai-areas";

/** Our area names that belong to a district and have a centre, in our own casing. */
const DISTRICT_AREAS: readonly (readonly [string, Coordinates])[] = DISTRICTS.flatMap((d) => d.areas)
  .map((area) => [area, AREA_CENTRES[area.toLowerCase()]] as const)
  .filter((pair): pair is readonly [string, Coordinates] => pair[1] != null);

export interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** What a curated row stores, every field from OSM, the venue's own site, or authored by us. */
export interface CatalogueRow {
  osmRef: string; // "node/123": provenance, for the review file
  name: string;
  category: string;
  area: string;
  district: string;
  cuisine: string;
  latitude: number;
  longitude: number;
  openTill: string; // "" when opening_hours doesn't say one closing time
  website: string | null;
  minimumAge: number;
  score: number;
}

const ADULT = new Set(["vibes", "nightlife", "live_music", "karaoke"]);
const RESTAURANT_DESSERT = /(^|;)\s*(ice_cream|dessert|cake|frozen_yogurt|chocolate|waffle|crepe)\s*(;|$)/;
const BREAKFAST = /(^|;)\s*(breakfast|brunch)\s*(;|$)/;

/** OSM tags → one of our 23 categories, or null. Order matters: the most specific wins. */
export function categoryOf(tags: Record<string, string>): string | null {
  const t = (k: string) => tags[k] ?? "";
  const cuisine = t("cuisine").toLowerCase();
  if (t("leisure") === "escape_game") return "escape";
  if (t("sport").split(";").includes("padel")) return "padel";
  if (t("amenity") === "karaoke_box" || t("karaoke") === "yes") return "karaoke";
  if (t("amenity") === "nightclub") return "nightlife";
  if (t("amenity") === "music_venue" || t("live_music") === "yes") return "live_music";
  if (t("amenity") === "hookah_lounge") return "shisha";
  if (t("amenity") === "bar" || t("amenity") === "pub") return "vibes";
  if (t("amenity") === "cinema") return "movie";
  if (["museum", "gallery"].includes(t("tourism")) || ["theatre", "arts_centre"].includes(t("amenity"))) return "culture";
  if (["zoo", "aquarium", "theme_park"].includes(t("tourism"))) return "family";
  if (t("leisure") === "water_park") return "water";
  if (t("leisure") === "beach_resort") return "beach_club";
  if (t("natural") === "beach") return "beach";
  if (["bowling_alley", "amusement_arcade"].includes(t("leisure"))) return "games";
  if (t("leisure") === "trampoline_park" || ["climbing", "karting", "skydiving"].some((s) => t("sport").split(";").includes(s))) return "adventure";
  if (["park", "nature_reserve"].includes(t("leisure"))) return "outdoors";
  if (t("leisure") === "sports_centre") return "sports";
  if (t("amenity") === "spa" || t("leisure") === "spa") return "wellness";
  if (t("shop") === "mall") return "shopping";
  if (t("amenity") === "ice_cream" || ((t("amenity") === "cafe" || t("amenity") === "restaurant") && RESTAURANT_DESSERT.test(cuisine))) return "dessert";
  if ((t("amenity") === "cafe" || t("amenity") === "restaurant") && BREAKFAST.test(cuisine)) return "brunch";
  if (t("amenity") === "cafe") return "cafe";
  if (t("amenity") === "restaurant") return "dinner";
  return null;
}

/** A chain (OSM's brand tags) or not a named, open place: never a curated pick. */
export function excluded(tags: Record<string, string>): string | null {
  if (!tags.name && !tags["name:en"]) return "no name";
  if (tags.brand || tags["brand:wikidata"]) return "chain (brand tag)";
  if (tags.disused || tags.abandoned || tags["disused:amenity"]) return "disused";
  if (["private", "customers", "members", "residents"].includes(tags.access ?? "")) return "not open to the public";
  if (/\b(hotel|resort)\b.*\bbeach\b|\bbeach\b.*\b(hotel|resort)\b/i.test(tags.name ?? "") && tags.access !== "yes") return "a hotel's own beach";
  return null;
}

/** How well kept the OSM object is: a proxy for an established venue. */
export function upkeepScore(tags: Record<string, string>): number {
  return (tags.website || tags["contact:website"] ? 4 : 0)
    + (tags.opening_hours ? 3 : 0)
    + (tags.phone || tags["contact:phone"] ? 1 : 0)
    + (tags["name:en"] ? 1 : 0)
    + (tags.description ? 1 : 0)
    + (tags.cuisine || tags.sport ? 1 : 0);
}

/**
 * One closing time from opening_hours, only when every day that lists hours
 * closes at the same time ("Mo-Su 12:00-24:00" -> "12am"). Anything else
 * (split shifts, several closing times, off/PH rules we can't read) -> "".
 */
export function openTillFrom(openingHours: string | undefined): string {
  if (!openingHours) return "";
  const text = openingHours.trim();
  if (text === "24/7") return "24/7";
  const ends = [...text.matchAll(/\d{1,2}:\d{2}\s*-\s*(\d{1,2}):(\d{2})\+?/g)].map((m) => `${m[1]}:${m[2]}`);
  if (ends.length === 0 || new Set(ends).size !== 1) return "";
  const [h, m] = ends[0].split(":").map(Number);
  if (h > 29 || m > 59) return "";
  const hour = h % 24;
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""}${hour < 12 ? "am" : "pm"}`;
}

const LABEL: Record<string, string> = {
  dinner: "Restaurant", cafe: "Cafe", brunch: "Breakfast and brunch", dessert: "Desserts", shisha: "Shisha lounge",
  vibes: "Bar and lounge", nightlife: "Nightclub", live_music: "Live music", karaoke: "Karaoke", beach: "Beach",
  beach_club: "Beach club", water: "Water park", sports: "Sports centre", padel: "Padel club", adventure: "Adventure",
  outdoors: "Park", games: "Games", movie: "Cinema", culture: "Museum and arts", wellness: "Spa", shopping: "Mall",
  family: "Family attraction", escape: "Escape rooms",
};

/** OSM's cuisine or sport tag, humanised ("italian;pizza" -> "Italian, pizza"), else our label. */
export function cuisineOf(tags: Record<string, string>, category: string): string {
  const raw = (tags.cuisine || (category === "sports" || category === "adventure" ? tags.sport : "") || "").trim();
  const words = raw.split(";").map((w) => w.trim().replace(/_/g, " ")).filter((w) => /^[a-z][a-z \-']{1,24}$/i.test(w)).slice(0, 2);
  if (words.length === 0) return LABEL[category] ?? "Place";
  const text = words.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The nearest of our area names that belongs to a district, within 3.5 km, or null. */
export function snapArea(lat: number, lon: number): { area: string; district: string } | null {
  let best: { area: string; km: number } | null = null;
  for (const [area, point] of DISTRICT_AREAS) {
    const km = distanceKm({ latitude: lat, longitude: lon }, point);
    if (!best || km < best.km) best = { area, km };
  }
  if (!best || best.km > 3.5) return null;
  const district = districtFor(best.area);
  return district ? { area: best.area, district } : null;
}

export const minimumAgeFor = (category: string) => (ADULT.has(category) ? 21 : 0);

const norm = (name: string) => name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();

/** Our 23 categories (components/categoryGroups.ts), for checking a forced one. */
export const CATEGORY_KEYS = new Set(Object.keys(LABEL));

/**
 * Candidates from Overpass elements, with every reason a row was dropped.
 * `forced` (osm ref -> category) is for hand-picked objects whose OSM tags
 * don't say the category we list them under (a shisha place tagged a cafe).
 */
export function candidatesFrom(elements: readonly OsmElement[], existingNames: readonly string[],
  forced: ReadonlyMap<string, string> = new Map()) {
  const existing = new Set(existingNames.map(norm));
  const seen = new Set<string>();
  const kept: CatalogueRow[] = [];
  const skipped: { ref: string; name: string; reason: string }[] = [];
  for (const el of elements) {
    const tags = el.tags ?? {};
    const ref = `${el.type}/${el.id}`;
    const name = (tags["name:en"] || tags.name || "").trim();
    const skip = (reason: string) => skipped.push({ ref, name, reason });
    const why = excluded(tags);
    if (why) { skip(why); continue; }
    const category = forced.get(ref) ?? categoryOf(tags);
    if (!category) { skip("no category"); continue; }
    if (!CATEGORY_KEYS.has(category)) { skip(`unknown category "${category}"`); continue; }
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) { skip("no coordinates"); continue; }
    const place = snapArea(lat, lon);
    if (!place) { skip("outside our districts"); continue; }
    if (existing.has(norm(name))) { skip("already in the catalogue"); continue; }
    const key = `${norm(name)}|${category}`;
    if (seen.has(key)) { skip("duplicate in OSM"); continue; }
    seen.add(key);
    kept.push({
      osmRef: ref, name, category, area: place.area, district: place.district, cuisine: cuisineOf(tags, category),
      latitude: Math.round(lat * 1e6) / 1e6, longitude: Math.round(lon * 1e6) / 1e6,
      openTill: openTillFrom(tags.opening_hours), website: tags.website || tags["contact:website"] || null,
      minimumAge: minimumAgeFor(category), score: upkeepScore(tags),
    });
  }
  return { kept, skipped };
}

/**
 * The picks: round-robin over categories, best upkeep first, and within a
 * category the least-represented district next, until `total` or nothing
 * is left. Deterministic (ties by name).
 */
export function selectSpread(rows: readonly CatalogueRow[], total: number, perCategoryCap = 8): CatalogueRow[] {
  const byCategory = new Map<string, CatalogueRow[]>();
  for (const row of [...rows].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))) {
    byCategory.set(row.category, [...(byCategory.get(row.category) ?? []), row]);
  }
  const picked: CatalogueRow[] = [];
  const perDistrict = new Map<string, number>();
  const perCategory = new Map<string, number>();
  let progress = true;
  while (picked.length < total && progress) {
    progress = false;
    for (const [category, list] of [...byCategory].sort((a, b) => a[0].localeCompare(b[0]))) {
      if (picked.length >= total || (perCategory.get(category) ?? 0) >= perCategoryCap || list.length === 0) continue;
      const top = list[0].score;
      const tier = list.filter((row) => row.score === top);
      const next = tier.sort((a, b) => (perDistrict.get(a.district) ?? 0) - (perDistrict.get(b.district) ?? 0) || a.name.localeCompare(b.name))[0];
      list.splice(list.indexOf(next), 1);
      picked.push(next);
      perDistrict.set(next.district, (perDistrict.get(next.district) ?? 0) + 1);
      perCategory.set(category, (perCategory.get(category) ?? 0) + 1);
      progress = true;
    }
  }
  return picked;
}
