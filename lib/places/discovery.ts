// Places DISCOVERY (docs/PLACES_INGESTION_SCOPE.md §1): candidate venues from
// a category x area grid of Text Search (New) requests. Pure, like client.ts:
// builds requests and shapes results; the script owns keys, network and files.
// Output is a local review file only. Nothing here writes a database, and the
// Google fields in it (price level, rating count, address, website) may not be
// stored anywhere lasting (terms §3.2.3): the review file is deleted after review.

import { assertSafeBaseUrl, PLACE_ID_PATTERN, type PlacesRequest } from "./client.ts";
import { TEXT_SEARCH_ENTERPRISE } from "./backfill.ts";

// Frozen and pinned by a test, like TEXT_SEARCH_FIELD_MASK. priceLevel,
// userRatingCount and websiteUri are Enterprise fields, so every request is
// "Text Search Enterprise": 1,000 free/month, then $35 per 1,000. Adding an
// Atmosphere field (reviews, editorialSummary, servesX...) would reprice it.
// websiteUri costs nothing extra at this tier and is the photo step's input.
export const DISCOVERY_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.types",
  "places.priceLevel",
  "places.userRatingCount",
  "places.websiteUri",
  "nextPageToken",
].join(",");

/** Google returns at most 20 per page; each page is a billed request. */
export const DISCOVERY_PAGE_SIZE = 20;
/** Stays under the 1,000/month Enterprise allowance even with a little else running. */
export const DEFAULT_MAX_REQUESTS = 900;

// 20 recognisable areas, each a 4 km bias circle. Reviewed constants.
export const DISCOVERY_AREAS: readonly { name: string; latitude: number; longitude: number }[] = [
  { name: "Dubai Marina", latitude: 25.08, longitude: 55.14 },
  { name: "JBR", latitude: 25.078, longitude: 55.133 },
  { name: "Palm Jumeirah", latitude: 25.112, longitude: 55.139 },
  { name: "JLT", latitude: 25.069, longitude: 55.144 },
  { name: "Al Barsha", latitude: 25.11, longitude: 55.2 },
  { name: "Umm Suqeim", latitude: 25.151, longitude: 55.207 },
  { name: "Al Quoz", latitude: 25.135, longitude: 55.235 },
  { name: "Dubai Hills", latitude: 25.113, longitude: 55.249 },
  { name: "Jumeirah", latitude: 25.21, longitude: 55.253 },
  { name: "City Walk", latitude: 25.207, longitude: 55.263 },
  { name: "Downtown Dubai", latitude: 25.197, longitude: 55.274 },
  { name: "Business Bay", latitude: 25.186, longitude: 55.262 },
  { name: "DIFC", latitude: 25.211, longitude: 55.28 },
  { name: "Al Satwa", latitude: 25.229, longitude: 55.27 },
  { name: "Al Karama", latitude: 25.246, longitude: 55.305 },
  { name: "Bur Dubai", latitude: 25.258, longitude: 55.297 },
  { name: "Deira", latitude: 25.271, longitude: 55.314 },
  { name: "Dubai Creek", latitude: 25.244, longitude: 55.331 },
  { name: "Dubai Festival City", latitude: 25.223, longitude: 55.35 },
  { name: "Hatta", latitude: 24.8, longitude: 56.12 },
];

// Our 23 categories as Google queries. `type` is a Table A type used with
// strict filtering where Google has a clean one; the rest are free text only
// (the doc's "weak row": expect noisier results and hand review).
export const DISCOVERY_QUERIES: Record<string, { text: string; type?: string }> = {
  dinner: { text: "restaurant", type: "restaurant" },
  cafe: { text: "cafe", type: "cafe" },
  brunch: { text: "brunch restaurant", type: "restaurant" },
  dessert: { text: "dessert shop", type: "dessert_shop" },
  shisha: { text: "shisha lounge" },
  vibes: { text: "rooftop lounge" },
  nightlife: { text: "bar", type: "bar" },
  live_music: { text: "live music venue" },
  karaoke: { text: "karaoke", type: "karaoke" },
  beach: { text: "public beach", type: "beach" },
  beach_club: { text: "beach club" },
  water: { text: "water sports" },
  sports: { text: "sports centre", type: "sports_complex" },
  padel: { text: "padel court" },
  adventure: { text: "adventure activity" },
  outdoors: { text: "park", type: "park" },
  games: { text: "arcade bowling", type: "amusement_center" },
  movie: { text: "cinema", type: "movie_theater" },
  culture: { text: "museum gallery", type: "museum" },
  wellness: { text: "spa", type: "spa" },
  shopping: { text: "shopping mall", type: "shopping_mall" },
  family: { text: "family attraction", type: "tourist_attraction" },
  escape: { text: "escape room" },
};

export interface GridCell { category: string; area: (typeof DISCOVERY_AREAS)[number] }

export function discoveryGrid(categories: string[], areas: string[]): GridCell[] {
  const areaRows = DISCOVERY_AREAS.filter((a) => areas.length === 0 || areas.includes(a.name));
  const cats = categories.length === 0 ? Object.keys(DISCOVERY_QUERIES) : categories;
  for (const category of cats) if (!DISCOVERY_QUERIES[category]) throw new Error(`Unknown category: ${category}`);
  for (const name of areas) if (!DISCOVERY_AREAS.some((a) => a.name === name)) throw new Error(`Unknown area: ${name}`);
  return cats.flatMap((category) => areaRows.map((area) => ({ category, area })));
}

export function buildDiscoveryRequest(cell: GridCell, apiKey: string, baseUrl: string, pageToken?: string): PlacesRequest {
  if (!apiKey || /\s/.test(apiKey)) throw new Error("A Google Places API key is required.");
  const query = DISCOVERY_QUERIES[cell.category];
  return {
    url: `${assertSafeBaseUrl(baseUrl)}/v1/places:searchText`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": DISCOVERY_FIELD_MASK },
      body: JSON.stringify({
        textQuery: `${query.text} in ${cell.area.name}, Dubai`,
        ...(query.type ? { includedType: query.type, strictTypeFiltering: true } : {}),
        pageSize: DISCOVERY_PAGE_SIZE,
        ...(pageToken ? { pageToken } : {}),
        languageCode: "en",
        regionCode: "AE",
        locationBias: { circle: { center: { latitude: cell.area.latitude, longitude: cell.area.longitude }, radius: 4_000 } },
      }),
    },
  };
}

export interface Candidate {
  place_id: string;
  name: string;
  category: string;
  area: string;
  lat: number | null;
  lng: number | null;
  price_level: string | null;
  rating_count: number | null;
  address: string | null;
  website: string | null;
  types: string[];
  /** Already a curated spot's google_place_id. */
  known: boolean;
}

const str = (v: unknown, max = 2_048) => (typeof v === "string" && v.length <= max ? v : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function parseDiscoveryPage(raw: unknown, cell: GridCell): { candidates: Omit<Candidate, "known">[]; nextPageToken: string | null } {
  const body = (raw ?? {}) as { places?: unknown; nextPageToken?: unknown };
  const places = Array.isArray(body.places) ? body.places : [];
  const candidates = places.flatMap((p) => {
    const place = (p ?? {}) as Record<string, unknown>;
    const id = str(place.id);
    const name = str((place.displayName as { text?: unknown } | undefined)?.text, 200);
    if (!id || !PLACE_ID_PATTERN.test(id) || !name) return [];
    const location = place.location as { latitude?: unknown; longitude?: unknown } | undefined;
    return [{
      place_id: id,
      name,
      category: cell.category,
      area: cell.area.name,
      lat: num(location?.latitude),
      lng: num(location?.longitude),
      price_level: str(place.priceLevel, 40),
      rating_count: num(place.userRatingCount),
      address: str(place.formattedAddress, 300),
      website: str(place.websiteUri),
      types: Array.isArray(place.types) ? place.types.filter((t): t is string => typeof t === "string").slice(0, 12) : [],
    }];
  });
  return { candidates, nextPageToken: str(body.nextPageToken) };
}

/** First sighting wins (its category and area); a place in our catalogue is marked, not dropped. */
export function dedupeCandidates(found: Omit<Candidate, "known">[], knownIds: ReadonlySet<string>): Candidate[] {
  const seen = new Map<string, Candidate>();
  for (const candidate of found) if (!seen.has(candidate.place_id)) seen.set(candidate.place_id, { ...candidate, known: knownIds.has(candidate.place_id) });
  return [...seen.values()];
}

const CSV_COLUMNS = ["name", "category", "area", "lat", "lng", "place_id", "price_level", "rating_count", "known", "address", "website"] as const;

export function candidatesCsv(rows: Candidate[]): string {
  const cell = (v: unknown) => {
    const text = v == null ? "" : String(v);
    // Quote always and double inner quotes. Text (never a number) starting
    // with =+-@ gets a ' so a spreadsheet can't run it as a formula.
    const safe = typeof v === "string" && /^[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return [CSV_COLUMNS.join(","), ...rows.map((row) => CSV_COLUMNS.map((c) => cell(row[c])).join(","))].join("\n") + "\n";
}

/** Upper bound: every cell uses every page. The run stops at `maxRequests` regardless. */
export function discoveryCost(cells: number, pages: number, maxRequests: number) {
  const requests = Math.min(cells * pages, maxRequests);
  const billable = Math.max(0, requests - TEXT_SEARCH_ENTERPRISE.freePerMonth);
  const usd = (n: number) => Math.round((n * TEXT_SEARCH_ENTERPRISE.usdPer1000) / 10) / 100;
  return { requests, maxCandidates: requests * DISCOVERY_PAGE_SIZE, usdIfFreeTierUnused: usd(billable), usdIfFreeTierSpent: usd(requests) };
}
