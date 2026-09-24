import { createClient } from "@/lib/supabase/server";
import { CONTROL_UNAVAILABLE_MESSAGE, consumeQuota, reportControlUnavailable } from "@/lib/security/controls";
import { placesApiKey } from "@/lib/places/config";
import { eligiblePlaceId, parseSpotId, resolvePlacePhoto, type PhotoSpotRow } from "@/lib/places/photo";

export const runtime = "nodejs";

// GET /api/spots/{spotId}/photo -- the Google Places photo FALLBACK for a
// curated spot with a place id and no photo of its own. See lib/places/photo.ts
// for the terms-driven design: nothing is cached or stored, the browser loads
// a short-lived Google URL, and the response carries the author attributions
// the UI must render beside the image.
//
// Every call is billable (Place Photos), so: a session is required (guests
// included -- share-link cards need it), a per-user and a global daily quota
// apply (migration 063), and only spot ids -- never photo refs or place ids --
// are accepted from the client.
//
// 200 { photoUri, widthPx, heightPx, attributions: [{ displayName, uri }] }
// 400 bad id · 401 no session · 404 no fallback photo for this spot
// 429 quota · 502 Google failed · 503 no key configured / controls down
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const spotId = parseSpotId((await params).id);
  if (!spotId) return Response.json({ error: "Not a spot." }, { status: 400, headers: NO_STORE });

  const apiKey = placesApiKey();
  if (!apiKey) return Response.json({ error: "Photos are not available." }, { status: 503, headers: NO_STORE });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // Permanent accounts only: a throwaway guest session is free to mint, so a
  // guest-reachable route could drain the shared daily photo budget.
  if (!user || user.is_anonymous) return Response.json({ error: "Sign in to see photos." }, { status: 401, headers: NO_STORE });

  // Read the row BEFORE spending quota: a spot with its own photo, or
  // without a place id, costs nothing and should not count. RLS applies --
  // a spot the caller cannot read is a 404 like any other.
  const { data, error } = await supabase
    .from("spots").select("id, source, photo_url, google_place_id").eq("id", spotId).maybeSingle();
  if (error) return Response.json({ error: "That spot could not be loaded." }, { status: 502, headers: NO_STORE });
  const placeId = eligiblePlaceId(data as PhotoSpotRow | null);
  if (!placeId) return Response.json({ error: "No photo for this spot." }, { status: 404, headers: NO_STORE });

  const quota = await consumeQuota(supabase, "place-photo");
  if (quota === "unavailable") {
    reportControlUnavailable("place-photo");
    return Response.json({ error: CONTROL_UNAVAILABLE_MESSAGE }, { status: 503, headers: NO_STORE });
  }
  if (quota === "limited") return Response.json({ error: "Too many photo requests. Try again later." }, { status: 429, headers: NO_STORE });

  try {
    const photo = await resolvePlacePhoto(placeId, apiKey);
    if (!photo) return Response.json({ error: "No photo for this spot." }, { status: 404, headers: NO_STORE });
    return Response.json(photo, { headers: NO_STORE });
  } catch (failure) {
    // The message is already key-free (placesFetchJson redacts); log the
    // class of failure, return a generic one.
    console.error("Places photo lookup failed", JSON.stringify({ spotId, reason: failure instanceof Error ? failure.message : "unknown" }));
    return Response.json({ error: "The photo could not be loaded." }, { status: 502, headers: NO_STORE });
  }
}
