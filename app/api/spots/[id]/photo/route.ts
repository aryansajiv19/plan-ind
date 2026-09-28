import { createClient } from "@/lib/supabase/server";
import { AUTH_UNAVAILABLE_MESSAGE, sessionUser } from "@/lib/auth";
import { CONTROL_UNAVAILABLE_MESSAGE, consumePhotoVisitorLimit, consumeQuota, reportControlUnavailable } from "@/lib/security/controls";
import { placesApiKey } from "@/lib/places/config";
import { PHOTO_CACHE, eligiblePlaceId, parseSpotId, photoQuotaFor, resolvePlacePhoto, type PhotoSpotRow } from "@/lib/places/photo";

export const runtime = "nodejs";

// GET /api/spots/{spotId}/photo -- the Google Places photo FALLBACK for a
// curated spot with a place id and no photo of its own. See lib/places/photo.ts
// for the terms-driven design: nothing is cached or stored, the browser loads
// a short-lived Google URL, and the response carries the author attributions
// the UI must render beside the image.
//
// Every call is billable (Place Photos), so it is always rate-limited: a
// permanent account spends its own daily quota (migration 063); anyone else
// -- signed out, or a guest session -- a per-hashed-IP limit (077), because
// the owner wants venue photos on the signed-out pages too. Both count
// against one global daily cap. Only spot ids -- never photo refs or place
// ids -- are accepted from the client. A found photo may be kept by the
// browser for an hour (private: never by a shared cache, ours included).
//
// 200 { photoUri, widthPx, heightPx, attributions: [{ displayName, uri }] }
// 200 null -- nothing to show: no key configured, no such spot, the spot has
//   its own photo or no place id, or Google has none. Expected states answer
//   2xx, so a page full of cards never logs a console error per card.
// 400 bad id
// 429 quota · 502 Google failed · 503 auth or controls down
const NO_STORE = { "Cache-Control": "private, no-store" };
let reportedNoKey = false;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const spotId = parseSpotId((await params).id);
  if (!spotId) return Response.json({ error: "Not a spot." }, { status: 400, headers: NO_STORE });

  const apiKey = placesApiKey();
  if (!apiKey) {
    // A deploy without the key shows no Google photos; say so once, server-side.
    if (!reportedNoKey) console.error("Places photos: GOOGLE_PLACES_API_KEY is not set; answering null");
    reportedNoKey = true;
    return Response.json(null, { headers: NO_STORE });
  }

  const supabase = await createClient();
  const user = await sessionUser(supabase);
  if (user === "unavailable") return Response.json({ error: AUTH_UNAVAILABLE_MESSAGE }, { status: 503, headers: NO_STORE });

  // Read the row BEFORE spending quota: a spot with its own photo, or
  // without a place id, costs nothing and should not count. RLS applies --
  // a spot the caller cannot read has no photo, like any other.
  const { data, error } = await supabase
    .from("spots").select("id, source, photo_url, google_place_id").eq("id", spotId).maybeSingle();
  if (error) return Response.json({ error: "That spot could not be loaded." }, { status: 502, headers: NO_STORE });
  const placeId = eligiblePlaceId(data as PhotoSpotRow | null);
  if (!placeId) return Response.json(null, { headers: PHOTO_CACHE });

  // A guest session is free to mint, so it gets the visitor limit, not an account's.
  const quota = photoQuotaFor(user) === "account"
    ? await consumeQuota(supabase, "place-photo")
    : await consumePhotoVisitorLimit(supabase, request);
  if (quota === "unavailable") {
    reportControlUnavailable("place-photo");
    return Response.json({ error: CONTROL_UNAVAILABLE_MESSAGE }, { status: 503, headers: NO_STORE });
  }
  if (quota === "limited") return Response.json({ error: "Too many photo requests. Try again later." }, { status: 429, headers: NO_STORE });

  try {
    const photo = await resolvePlacePhoto(placeId, apiKey);
    if (!photo) return Response.json(null, { headers: PHOTO_CACHE });
    return Response.json(photo, { headers: PHOTO_CACHE });
  } catch (failure) {
    // The message is already key-free (placesFetchJson redacts); log the
    // class of failure, return a generic one.
    console.error("Places photo lookup failed", JSON.stringify({ spotId, reason: failure instanceof Error ? failure.message : "unknown" }));
    return Response.json({ error: "The photo could not be loaded." }, { status: 502, headers: NO_STORE });
  }
}
