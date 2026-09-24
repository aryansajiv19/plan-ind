import { overlapScore, tokenize } from "../place-import/match.ts";
import { coordinatesForArea, distanceKm, type Coordinates } from "../dubai-areas.ts";
import type { PlaceResult } from "./client.ts";

// Decides whether a Text Search result IS the curated spot. A wrong
// place_id is worse than none: every later refresh, photo and link inherits
// the error, and it looks completely right (Black Tap NYC, the wrong VOX
// branch -- docs/PLACES_INGESTION_SCOPE.md). So the default is "a human
// looks", and only agreement on BOTH name and location auto-approves.
//
// Name: the same tokenizer + symmetric F1 as link import (lib/place-import/
// match.ts), because a min()-divisor score was what matched "Saffron" the
// restaurant to saffron the spice. Location: the spot's own coordinates when
// it has them (40 of 82 do, migration 037/042), else the area centroid,
// which is only good enough to REJECT, never to approve on its own.

export type MatchConfidence = "high" | "review" | "reject";

export interface MatchSpot {
  id: string;
  name: string;
  area: string;
  latitude: number | null;
  longitude: number | null;
}

export interface PlaceMatch {
  confidence: MatchConfidence;
  place: PlaceResult | null;
  nameScore: number;
  distanceKm: number | null;
  distanceFrom: "spot" | "area" | null;
  reasons: string[];
}

// Padded to include Hatta and the desert spots; same box the coordinate
// backfill used.
const DUBAI_BOUNDS = { minLat: 24.6, maxLat: 25.6, minLng: 54.8, maxLng: 56.5 };

export const MATCH_THRESHOLDS = {
  highName: 0.8,
  minName: 0.5,
  // A venue's own pin and Google's usually sit within a building of each
  // other; 300 m allows for mall/hotel footprints, not the next branch.
  highSpotKm: 0.3,
  maxSpotKm: 2,
  maxAreaKm: 8,
  // Two candidates this close on name are two branches, not one answer.
  ambiguityMargin: 0.1,
} as const;

function inDubai(location: Coordinates): boolean {
  return location.latitude >= DUBAI_BOUNDS.minLat && location.latitude <= DUBAI_BOUNDS.maxLat
    && location.longitude >= DUBAI_BOUNDS.minLng && location.longitude <= DUBAI_BOUNDS.maxLng;
}

export function nameSimilarity(spotName: string, placeName: string): number {
  const a = tokenize(spotName);
  const b = tokenize(placeName);
  // Exact after normalisation beats token maths: "SoBe" vs "SOBE" is 1.
  if (a.size > 0 && [...a].join(" ") === [...b].join(" ")) return 1;
  return overlapScore(a, b);
}

function scoreOne(spot: MatchSpot, place: PlaceResult): PlaceMatch {
  const reasons: string[] = [];
  const nameScore = Math.round(nameSimilarity(spot.name, place.displayName) * 1000) / 1000;
  const own = spot.latitude !== null && spot.longitude !== null ? { latitude: spot.latitude, longitude: spot.longitude } : null;
  const reference = own ?? coordinatesForArea(spot.area);
  const distanceFrom = own ? "spot" : reference ? "area" : null;
  const distance = reference && place.location ? Math.round(distanceKm(reference, place.location) * 1000) / 1000 : null;

  if (!place.location) return { confidence: "review", place, nameScore, distanceKm: null, distanceFrom, reasons: ["google returned no location"] };
  if (!inDubai(place.location)) return { confidence: "reject", place, nameScore, distanceKm: distance, distanceFrom, reasons: ["outside Dubai"] };
  if (nameScore < MATCH_THRESHOLDS.minName) {
    return { confidence: "reject", place, nameScore, distanceKm: distance, distanceFrom, reasons: [`name disagrees (${nameScore})`] };
  }
  if (distance !== null) {
    const limit = distanceFrom === "spot" ? MATCH_THRESHOLDS.maxSpotKm : MATCH_THRESHOLDS.maxAreaKm;
    if (distance > limit) {
      return { confidence: "reject", place, nameScore, distanceKm: distance, distanceFrom, reasons: [`${distance} km from the ${distanceFrom}`] };
    }
  }

  const strongName = nameScore >= MATCH_THRESHOLDS.highName;
  const closeToOwnPin = distanceFrom === "spot" && distance !== null && distance <= MATCH_THRESHOLDS.highSpotKm;
  if (!strongName) reasons.push(`partial name match (${nameScore})`);
  if (distanceFrom === "area") reasons.push("spot has no coordinates; only the area centroid was checked");
  if (distanceFrom === null) reasons.push("no location to compare against");
  if (distanceFrom === "spot" && !closeToOwnPin) reasons.push(`${distance} km from the spot's own pin`);
  return {
    confidence: strongName && closeToOwnPin ? "high" : "review",
    place, nameScore, distanceKm: distance, distanceFrom, reasons,
  };
}

const RANK: Record<MatchConfidence, number> = { high: 2, review: 1, reject: 0 };

// Best candidate, then an ambiguity check: if a DIFFERENT place scores
// within the margin on name and is not rejected, a "high" becomes "review".
// Ties are broken on name score, then distance, then place id -- never on
// the API's own order, which is not a stable contract.
export function matchPlace(spot: MatchSpot, places: PlaceResult[]): PlaceMatch {
  if (places.length === 0) {
    return { confidence: "reject", place: null, nameScore: 0, distanceKm: null, distanceFrom: null, reasons: ["no results"] };
  }
  const scored = places.map((place) => scoreOne(spot, place)).sort((a, b) =>
    RANK[b.confidence] - RANK[a.confidence]
    || b.nameScore - a.nameScore
    || (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity)
    || (a.place!.id < b.place!.id ? -1 : 1));
  const [best, ...rest] = scored;
  const rival = rest.find((other) => other.confidence !== "reject"
    && other.place!.id !== best.place!.id
    && best.nameScore - other.nameScore <= MATCH_THRESHOLDS.ambiguityMargin);
  if (best.confidence === "high" && rival) {
    return { ...best, confidence: "review", reasons: [...best.reasons, `ambiguous with "${rival.place!.displayName}"`] };
  }
  return best;
}
