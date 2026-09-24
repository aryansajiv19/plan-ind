import type { PlaceResult } from "./client.ts";
import { matchPlace, type MatchConfidence, type MatchSpot } from "./match.ts";
import { photoFileName, type ApprovedPhoto, type ApprovedPlaceId } from "./sql.ts";

// The backfill pipeline, with every side effect injected so the whole run is
// provable against recorded fixtures. scripts/places-backfill.ts wires the
// real Places client, safe-fetch and the filesystem in; tests wire fakes.
//
// Output is a REVIEW FILE, never a database write. Each entry carries an
// `approve` flag the owner edits by hand; only approved entries ever reach
// a generated migration (planFromReview). High confidence defaults to
// approved, everything else to not -- a human flips it, not the script.

export interface BackfillSpot extends MatchSpot {
  category: string;
  photo_url: string | null;
}

export interface ReviewPhoto {
  status: "saved" | "skipped" | "failed";
  approve: boolean;
  file?: string;
  bytes?: number;
  sourcePage?: string;
  imageUrl?: string;
  detail?: string;
}

export interface ReviewEntry {
  spotId: string;
  spotName: string;
  area: string;
  category: string;
  approve: boolean;
  confidence: MatchConfidence | "error";
  nameScore: number;
  distanceKm: number | null;
  distanceFrom: "spot" | "area" | null;
  reasons: string[];
  // Google content, held only in this local, gitignored file for the human
  // review, and deleted after the migration is generated. None of it is
  // written to the database (Maps Platform terms: only place_id may be kept).
  place: PlaceResult | null;
  photo: ReviewPhoto;
}

export interface ReviewFile {
  generatedAt: string;
  fieldMask: string;
  textSearchRequests: number;
  estimate: CostEstimate;
  entries: ReviewEntry[];
}

export interface FetchedImage {
  bytes: Uint8Array;
  contentType: string;
}

export interface BackfillDeps {
  searchText(spot: BackfillSpot): Promise<PlaceResult[]>;
  /** The venue page's og:image (raw attribute value), or null. */
  fetchOgImage(pageUrl: string): Promise<string | null>;
  downloadImage(url: string): Promise<FetchedImage>;
  saveFile(name: string, bytes: Uint8Array): Promise<void>;
  sleep(ms: number): Promise<void>;
  log(line: string): void;
}

// ── Cost, from the SKU table in docs/PLACES_INGESTION_SCOPE.md §2 ─────────
// Text Search with websiteUri in the mask bills as Enterprise: 1,000 free
// requests per month, then $35 per 1,000. One request per spot.
export const TEXT_SEARCH_ENTERPRISE = { freePerMonth: 1_000, usdPer1000: 35 } as const;

export interface CostEstimate {
  requests: number;
  withinFreeTierUsd: number;
  worstCaseUsd: number;
  note: string;
}

export function estimateCost(requests: number): CostEstimate {
  return {
    requests,
    withinFreeTierUsd: 0,
    worstCaseUsd: Math.round((requests * TEXT_SEARCH_ENTERPRISE.usdPer1000) / 10) / 100,
    note: `Text Search Enterprise: first ${TEXT_SEARCH_ENTERPRISE.freePerMonth}/month free, then $${TEXT_SEARCH_ENTERPRISE.usdPer1000}/1,000. `
      + "worstCaseUsd assumes this month's free allowance is already spent.",
  };
}

// JPEG, PNG and WebP by their magic bytes -- a server's content-type header
// is its claim, not a fact, and these files go into a public bucket.
export function sniffImage(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "image/png";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP") return "image/webp";
  return null;
}

// og:image values arrive HTML-attribute-encoded and may be relative.
export function resolveOgImage(raw: string, pageUrl: string): string | null {
  const decoded = raw.replace(/&amp;/g, "&").replace(/&#0*38;/g, "&").trim();
  try {
    const url = new URL(decoded, pageUrl);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

async function sourcePhoto(spot: BackfillSpot, websiteUri: string | null, approve: boolean, deps: BackfillDeps): Promise<ReviewPhoto> {
  if (spot.photo_url) return { status: "skipped", approve: false, detail: "spot already has a photo" };
  if (!websiteUri) return { status: "skipped", approve: false, detail: "no website in Google; Places photo fallback applies" };
  try {
    const og = await deps.fetchOgImage(websiteUri);
    const imageUrl = og ? resolveOgImage(og, websiteUri) : null;
    if (!imageUrl) return { status: "failed", approve: false, sourcePage: websiteUri, detail: "no og:image on the venue's site" };
    const image = await deps.downloadImage(imageUrl);
    const sniffed = sniffImage(image.bytes);
    if (!sniffed) return { status: "failed", approve: false, sourcePage: websiteUri, imageUrl, detail: `not a JPEG/PNG/WebP (${image.contentType})` };
    const file = photoFileName(spot.id, sniffed);
    await deps.saveFile(file, image.bytes);
    return { status: "saved", approve, file, bytes: image.bytes.byteLength, sourcePage: websiteUri, imageUrl };
  } catch (error) {
    return { status: "failed", approve: false, sourcePage: websiteUri, detail: error instanceof Error ? error.message : "fetch failed" };
  }
}

const MAX_CONSECUTIVE_ERRORS = 3;

export async function runBackfill(
  spots: BackfillSpot[],
  deps: BackfillDeps,
  options: { delayMs: number; photos: boolean; fieldMask: string; now?: () => Date },
): Promise<ReviewFile> {
  const entries: ReviewEntry[] = [];
  let requests = 0;
  let consecutiveErrors = 0;
  for (const [index, spot] of spots.entries()) {
    // A bad key or an exhausted quota fails every request the same way;
    // three in a row stops the run instead of repeating it 82 times.
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      deps.log(`  stopping: ${consecutiveErrors} searches failed in a row; ${spots.length - index} spots not attempted`);
      break;
    }
    // Sequential, with a pause: 82 requests is not worth a burst that trips
    // per-minute quotas, and a failed venue must not cost the ones before it.
    if (index > 0) await deps.sleep(options.delayMs);
    let places: PlaceResult[];
    try {
      requests++;
      places = await deps.searchText(spot);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "search failed";
      consecutiveErrors++;
      deps.log(`  error   ${spot.name}: ${detail}`);
      entries.push({
        spotId: spot.id, spotName: spot.name, area: spot.area, category: spot.category,
        approve: false, confidence: "error", nameScore: 0, distanceKm: null, distanceFrom: null,
        reasons: [detail], place: null, photo: { status: "skipped", approve: false, detail: "search failed" },
      });
      continue;
    }
    consecutiveErrors = 0;
    const match = matchPlace(spot, places);
    const approve = match.confidence === "high";
    const photo = options.photos && match.confidence !== "reject"
      ? await sourcePhoto(spot, match.place?.websiteUri ?? null, approve, deps)
      : { status: "skipped" as const, approve: false, detail: options.photos ? "no accepted match" : "photos disabled" };
    deps.log(`  ${match.confidence.padEnd(7)} ${spot.name} -> ${match.place?.displayName ?? "(none)"} [name ${match.nameScore}${match.distanceKm !== null ? `, ${match.distanceKm} km from ${match.distanceFrom}` : ""}] photo:${photo.status}`);
    entries.push({
      spotId: spot.id, spotName: spot.name, area: spot.area, category: spot.category,
      approve, confidence: match.confidence, nameScore: match.nameScore,
      distanceKm: match.distanceKm, distanceFrom: match.distanceFrom, reasons: match.reasons,
      place: match.place, photo,
    });
  }
  return {
    generatedAt: (options.now?.() ?? new Date()).toISOString(),
    fieldMask: options.fieldMask,
    textSearchRequests: requests,
    estimate: estimateCost(requests),
    entries,
  };
}

export interface ReviewPlan {
  placeIds: ApprovedPlaceId[];
  photos: ApprovedPhoto[];
}

// Reads the owner-edited review file. Strict `=== true`: a missing or
// mistyped flag is a "no", never a "yes". A photo needs its own approval AND
// its place's -- a venue we did not accept cannot contribute its photo.
export function planFromReview(review: ReviewFile): ReviewPlan {
  if (!review || !Array.isArray(review.entries)) throw new Error("Not a review file.");
  const placeIds: ApprovedPlaceId[] = [];
  const photos: ApprovedPhoto[] = [];
  for (const entry of review.entries) {
    if (entry.approve !== true || !entry.place?.id) continue;
    placeIds.push({ spotId: entry.spotId, spotName: entry.spotName, placeId: entry.place.id });
    if (entry.photo?.approve === true && entry.photo.status === "saved" && entry.photo.file) {
      photos.push({ spotId: entry.spotId, spotName: entry.spotName, file: entry.photo.file, sourcePage: entry.photo.sourcePage ?? "" });
    }
  }
  return { placeIds, photos };
}
