// Google Places API (New) request construction. Pure: builds requests and
// parses responses, never reads env and never logs. The caller supplies the
// key and a fetch, so the hermetic tests can prove where the key goes.
//
// ── Where the key goes ────────────────────────────────────────────────────
// ONLY the `X-Goog-Api-Key` header. Never a `?key=` query parameter: URLs
// end up in logs, error messages, proxies and Referer headers; headers do
// not. `redactKey` exists for the one place a key could still leak -- an
// error string echoed from somewhere we don't control.
//
// ── Why the field masks are frozen constants ──────────────────────────────
// Billing follows the HIGHEST tier field in a request
// (docs/PLACES_INGESTION_SCOPE.md §2). One stray `reviews` silently reprices
// every call to Enterprise + Atmosphere. The masks below are reviewed; a test
// pins them field-for-field so an edit here is a visible, deliberate diff.

export const PLACES_API_BASE = "https://places.googleapis.com";

// Text Search (New). websiteUri/rating/userRatingCount/priceLevel/
// regularOpeningHours are Enterprise fields, so this is billed as
// "Text Search Enterprise": 1,000 free requests/month, then $35 per 1,000.
// No Atmosphere field (reviews, editorialSummary, servesX, ...) is here.
export const TEXT_SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.googleMapsUri",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.regularOpeningHours",
  "places.photos",
].join(",");

// Place Details (New) asking for photo metadata only -- used per view by the
// photo route, because photo names may not be cached (they also expire).
export const PHOTO_DETAILS_FIELD_MASK = "photos";

// Text Search bias: a 30 km circle on central Dubai reaches Palm Jumeirah,
// JBR, Al Barsha, Deira and Al Khawaneej. Hatta is outside it -- a bias, not
// a restriction, so a Hatta query still resolves, it just isn't favoured.
export const DUBAI_BIAS = {
  circle: { center: { latitude: 25.2048, longitude: 55.2708 }, radius: 30_000 },
} as const;

// A Place ID is URL-safe base64-ish. Enforced before one is ever put in a
// URL path or a SQL literal; the same pattern is a CHECK in migration 063.
export const PLACE_ID_PATTERN = /^[A-Za-z0-9_-]{10,255}$/;

export interface PlacesRequest {
  url: string;
  init: { method: "GET" | "POST"; headers: Record<string, string>; body?: string };
}

export interface PlaceSearchSpot {
  name: string;
  area: string;
}

function assertKey(apiKey: string): void {
  if (!apiKey || /\s/.test(apiKey)) throw new Error("A Google Places API key is required.");
}

// Only https, except a loopback host for the local fixture server. Anything
// else would send the key in cleartext or to a host we did not choose.
export function assertSafeBaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error("The Places base URL must be https (or http on loopback for fixtures).");
  }
  if (url.protocol === "https:" && !loopback && url.hostname !== "places.googleapis.com") {
    throw new Error("The Places base URL must be places.googleapis.com.");
  }
  return url.origin;
}

export function buildTextSearchRequest(spot: PlaceSearchSpot, apiKey: string, baseUrl = PLACES_API_BASE): PlacesRequest {
  assertKey(apiKey);
  return {
    url: `${assertSafeBaseUrl(baseUrl)}/v1/places:searchText`,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": TEXT_SEARCH_FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: `${spot.name}, ${spot.area}, Dubai`,
        // Billing is per request, not per result; five lets the matcher see
        // competing branches ("which Black Tap?") at no extra cost.
        pageSize: 5,
        languageCode: "en",
        regionCode: "AE",
        locationBias: DUBAI_BIAS,
      }),
    },
  };
}

export function buildPhotoDetailsRequest(placeId: string, apiKey: string, baseUrl = PLACES_API_BASE): PlacesRequest {
  assertKey(apiKey);
  if (!PLACE_ID_PATTERN.test(placeId)) throw new Error("Not a valid place id.");
  return {
    url: `${assertSafeBaseUrl(baseUrl)}/v1/places/${placeId}`,
    init: { method: "GET", headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": PHOTO_DETAILS_FIELD_MASK } },
  };
}

// `places/{placeId}/photos/{ref}` -- and the place segment must be the place
// we asked about, so a response can never steer us at another resource.
export function isPhotoNameFor(placeId: string, name: string): boolean {
  const prefix = `places/${placeId}/photos/`;
  return name.startsWith(prefix) && /^[A-Za-z0-9_-]{1,1000}$/.test(name.slice(prefix.length));
}

export const PHOTO_MAX_WIDTH_PX = 800;

export function buildPhotoMediaRequest(placeId: string, photoName: string, apiKey: string, baseUrl = PLACES_API_BASE): PlacesRequest {
  assertKey(apiKey);
  if (!PLACE_ID_PATTERN.test(placeId) || !isPhotoNameFor(placeId, photoName)) throw new Error("Not a valid photo name.");
  const query = new URLSearchParams({ maxWidthPx: String(PHOTO_MAX_WIDTH_PX), skipHttpRedirect: "true" });
  return {
    url: `${assertSafeBaseUrl(baseUrl)}/v1/${photoName}/media?${query}`,
    init: { method: "GET", headers: { "X-Goog-Api-Key": apiKey } },
  };
}

export function redactKey(text: string, apiKey: string | undefined): string {
  return apiKey ? text.split(apiKey).join("[redacted]") : text;
}

// ── Response shapes: only what we read, validated rather than cast ────────

export interface PlaceResult {
  id: string;
  displayName: string;
  formattedAddress: string | null;
  location: { latitude: number; longitude: number } | null;
  googleMapsUri: string | null;
  websiteUri: string | null;
  rating: number | null;
  userRatingCount: number | null;
  priceLevel: string | null;
  weekdayDescriptions: string[] | null;
  photoCount: number;
}

const str = (value: unknown): string | null => (typeof value === "string" && value.length <= 2_048 ? value : null);
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

export function parsePlace(raw: unknown): PlaceResult | null {
  if (!raw || typeof raw !== "object") return null;
  const place = raw as Record<string, unknown>;
  const id = str(place.id);
  const displayName = str((place.displayName as { text?: unknown } | undefined)?.text);
  if (!id || !PLACE_ID_PATTERN.test(id) || !displayName) return null;
  const location = place.location as { latitude?: unknown; longitude?: unknown } | undefined;
  const latitude = num(location?.latitude);
  const longitude = num(location?.longitude);
  const hours = (place.regularOpeningHours as { weekdayDescriptions?: unknown } | undefined)?.weekdayDescriptions;
  return {
    id,
    displayName,
    formattedAddress: str(place.formattedAddress),
    location: latitude !== null && longitude !== null ? { latitude, longitude } : null,
    googleMapsUri: str(place.googleMapsUri),
    websiteUri: str(place.websiteUri),
    rating: num(place.rating),
    userRatingCount: num(place.userRatingCount),
    priceLevel: str(place.priceLevel),
    weekdayDescriptions: Array.isArray(hours) ? hours.filter((line): line is string => typeof line === "string").slice(0, 7) : null,
    photoCount: Array.isArray(place.photos) ? place.photos.length : 0,
  };
}

export function parseTextSearch(raw: unknown): PlaceResult[] {
  const places = (raw as { places?: unknown } | null)?.places;
  if (!Array.isArray(places)) return [];
  return places.map(parsePlace).filter((place): place is PlaceResult => place !== null);
}

export interface PhotoAttribution {
  displayName: string;
  uri: string | null;
}

export interface PlacePhotoRef {
  name: string;
  widthPx: number | null;
  heightPx: number | null;
  attributions: PhotoAttribution[];
}

// First photo whose name belongs to `placeId`. Attributions are carried
// through because showing them is a condition of displaying the photo.
export function firstPhotoRef(raw: unknown, placeId: string): PlacePhotoRef | null {
  const photos = (raw as { photos?: unknown } | null)?.photos;
  if (!Array.isArray(photos)) return null;
  for (const photo of photos) {
    const name = str((photo as { name?: unknown })?.name);
    if (!name || !isPhotoNameFor(placeId, name)) continue;
    const authors = (photo as { authorAttributions?: unknown }).authorAttributions;
    const attributions = Array.isArray(authors)
      ? authors.flatMap((author) => {
        const displayName = str((author as { displayName?: unknown })?.displayName);
        const uri = str((author as { uri?: unknown })?.uri);
        return displayName ? [{ displayName: displayName.slice(0, 120), uri: uri && /^https:\/\//.test(uri) ? uri : null }] : [];
      }).slice(0, 3)
      : [];
    return {
      name,
      widthPx: num((photo as { widthPx?: unknown }).widthPx),
      heightPx: num((photo as { heightPx?: unknown }).heightPx),
      attributions,
    };
  }
  return null;
}

// photoUri is a short-lived Google-hosted URL the browser loads directly.
// Exact hosts only: a response pointing anywhere else is refused rather
// than handed to an <img>.
export const PHOTO_URI_HOSTS = new Set([
  "lh3.googleusercontent.com",
  "lh4.googleusercontent.com",
  "lh5.googleusercontent.com",
  "lh6.googleusercontent.com",
]);

export function parsePhotoUri(raw: unknown): string | null {
  const value = str((raw as { photoUri?: unknown } | null)?.photoUri);
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && PHOTO_URI_HOSTS.has(url.hostname) && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

// One request with a hard deadline. Returns parsed JSON or throws an Error
// whose message never contains the key (the URL never did; this also scrubs
// anything a server echoed back).
export async function placesFetchJson(
  request: PlacesRequest,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 8_000,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(request.url, { ...request.init, signal: AbortSignal.timeout(timeoutMs), redirect: "error" });
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError" ? "timed out" : "could not be reached";
    throw new Error(`Places API ${reason}.`);
  }
  if (!response.ok) {
    let status = "";
    try {
      status = str(((await response.json()) as { error?: { status?: unknown } })?.error?.status) ?? "";
    } catch {
      // Body was not JSON; the HTTP status alone is enough to act on.
    }
    throw new Error(redactKey(`Places API HTTP ${response.status}${status ? ` ${status}` : ""}.`, apiKey));
  }
  return response.json();
}
