import {
  buildPhotoDetailsRequest,
  buildPhotoMediaRequest,
  firstPhotoRef,
  parsePhotoUri,
  placesFetchJson,
  PLACE_ID_PATTERN,
  type PhotoAttribution,
} from "./client.ts";

// The Google-photo FALLBACK for a curated spot that has a place id but no
// photo of its own. Decided from docs/PLACES_INGESTION_SCOPE.md §1 and the
// Maps Platform terms: Google photos may not be cached or stored, and photo
// names expire and may not be cached either. So this never stores or proxies
// image bytes; per request it (1) reads the place's photo list, (2) asks for
// a short-lived photoUri with skipHttpRedirect, and (3) hands that URI plus
// the author attributions (a display condition) to the browser, which loads
// the image from Google directly. The API key only ever travels server ->
// Google, in a header.
//
// Inputs are never client-supplied refs: the route takes a spot id, and the
// place id comes from our own row. The photo name comes from Google's answer
// about THAT place id and is checked to belong to it before use.

export const SPOT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseSpotId(raw: string): string | null {
  return typeof raw === "string" && SPOT_ID_PATTERN.test(raw) ? raw.toLowerCase() : null;
}

export interface PhotoSpotRow {
  id: string;
  source: string;
  photo_url: string | null;
  google_place_id: string | null;
}

// Which rows may spend a billable photo call. Custom spots never carry a
// place id (063's CHECK), and a spot with its own photo does not need one.
export function eligiblePlaceId(row: PhotoSpotRow | null): string | null {
  if (!row || row.source !== "curated" || row.photo_url) return null;
  return row.google_place_id && PLACE_ID_PATTERN.test(row.google_place_id) ? row.google_place_id : null;
}

export interface PlacePhoto {
  photoUri: string;
  widthPx: number | null;
  heightPx: number | null;
  attributions: PhotoAttribution[];
}

// Each Google call gets its own deadline; the route's total worst case is
// the sum (~8s), well inside a serverless function's budget.
const CALL_TIMEOUT_MS = 4_000;

export async function resolvePlacePhoto(
  placeId: string,
  apiKey: string,
  options: { fetchImpl?: typeof fetch; baseUrl?: string } = {},
): Promise<PlacePhoto | null> {
  const details = await placesFetchJson(buildPhotoDetailsRequest(placeId, apiKey, options.baseUrl), apiKey, options.fetchImpl, CALL_TIMEOUT_MS);
  const ref = firstPhotoRef(details, placeId);
  if (!ref) return null;
  const media = await placesFetchJson(buildPhotoMediaRequest(placeId, ref.name, apiKey, options.baseUrl), apiKey, options.fetchImpl, CALL_TIMEOUT_MS);
  const photoUri = parsePhotoUri(media);
  if (!photoUri) return null;
  return { photoUri, widthPx: ref.widthPx, heightPx: ref.heightPx, attributions: ref.attributions };
}
