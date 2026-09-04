import { createClient } from "@/lib/supabase/server";
import { classifyPlaceLink, type PlaceCollectionKind } from "@/lib/place-import";
import { resolvePlaceImport } from "@/lib/place-import/resolve";
import {
  readJsonBody,
  requestError,
  validateMutationRequest,
} from "@/lib/security/request";
import { consumeQuota, recordSecurityEvent } from "@/lib/security/controls";

const MAPS_URL = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

async function authenticatedProfile(supabase: Awaited<ReturnType<typeof createClient>>, user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }) {
  const metadataName = user.user_metadata?.full_name ?? user.user_metadata?.name;
  const fallbackName = (typeof metadataName === "string" && metadataName.trim()) || user.email?.split("@")[0] || "Friend";
  const { data, error } = await supabase.rpc("ensure_authenticated_profile", { p_display_name: fallbackName });
  if (error || typeof data !== "string") throw new Error("Your profile could not be prepared.");
  return data;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    validateMutationRequest(request);
    body = await readJsonBody(request, 4_096);
  } catch (error) {
    return requestError(error, "The request could not be read.");
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Sign in to save a place." }, { status: 401 });
  }
  if (!(await consumeQuota(supabase, "place-import"))) {
    await recordSecurityEvent(supabase, { type: "rate_limit", outcome: "blocked", subject: user.id, requestId: request.headers.get("x-vercel-id"), metadata: { scope: "place-import" } });
    return Response.json({ error: "Too many saved links. Try again later." }, { status: 429 });
  }

  const sourceUrl = typeof body === "object" && body !== null && "url" in body
    ? String((body as { url: unknown }).url).trim()
    : "";
  const requestedCollection = typeof body === "object" && body !== null && "collection" in body
    && ((body as { collection?: unknown }).collection === "planning" || (body as { collection?: unknown }).collection === "want_to_try")
    ? (body as { collection: "planning" | "want_to_try" }).collection
    : "want_to_try";
  if (!sourceUrl || sourceUrl.length > 2_048) {
    return Response.json({ error: "Paste a link shorter than 2,048 characters." }, { status: 400 });
  }

  try {
    const candidate = classifyPlaceLink(sourceUrl);
    const personId = await authenticatedProfile(supabase, user);
    let { data: collection } = await supabase
      .from("place_collections").select("id").eq("person_id", personId).eq("kind", requestedCollection).maybeSingle();
    if (!collection) {
      const created = await supabase.from("place_collections").insert({ person_id: personId, name: requestedCollection === "planning" ? "Planning" : "Want to try", kind: requestedCollection }).select("id").single();
      collection = created.data;
      if (created.error || !collection) throw new Error("Your Planning collection could not be prepared.");
    }
    // Fetch-then-insert, not upsert: re-saving the same link (e.g. to a
    // second collection) must not stomp a row that already resolved --
    // an upsert with status:"pending" in its values would reset it and
    // force a pointless re-fetch of the source on every re-save.
    const { data: existing } = await supabase
      .from("place_imports").select("id, status").eq("person_id", personId).eq("normalized_url", candidate.normalizedUrl).maybeSingle();

    let importId: string;
    let importStatus: string;
    if (existing) {
      importId = existing.id;
      importStatus = existing.status;
    } else {
      const { data: imported, error: importError } = await supabase
        .from("place_imports")
        .insert({ person_id: personId, source_url: sourceUrl, normalized_url: candidate.normalizedUrl, provider: candidate.provider, status: "pending" })
        .select("id")
        .single();
      if (importError?.code === "23505") {
        // Two concurrent first-time saves of the same new link from the
        // same user both missed the select above and raced the insert --
        // the loser re-selects the winner's row rather than surfacing a
        // spurious failure for what is, from the user's perspective, a
        // successful save.
        const { data: winner } = await supabase
          .from("place_imports").select("id, status").eq("person_id", personId).eq("normalized_url", candidate.normalizedUrl).maybeSingle();
        if (!winner) throw new Error("That link could not be saved.");
        importId = winner.id;
        importStatus = winner.status;
      } else {
        if (importError || !imported) throw new Error("That link could not be saved.");
        importId = imported.id;
        importStatus = "pending";
      }
    }

    const { error: itemError } = await supabase.from("place_collection_items").insert({ collection_id: collection.id, import_id: importId });
    if (itemError && itemError.code !== "23505") throw new Error("That link was saved, but could not be added to Planning.");

    if (importStatus === "pending") {
      // Synchronous, deliberately: no queue/background-job infra exists in
      // this app, and every adapter call is bounded (5s timeout, capped
      // response) -- worst case adds ~5s to this request. Upgrade path if
      // that ever becomes a real complaint: move behind a job, not before.
      await resolvePlaceImport(supabase, { id: importId, provider: candidate.provider, normalizedUrl: candidate.normalizedUrl });
    }

    return Response.json({ candidate, id: importId, collection: requestedCollection, status: "saved" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "That link is not supported." }, { status: 400 });
  }
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in to view saved places." }, { status: 401 });
  try {
    const personId = await authenticatedProfile(supabase, user);
    const { data, error } = await supabase
      .from("place_imports")
      .select(`
        id, normalized_url, provider, status, extracted_data,
        place_collection_items(collection:place_collections(kind)),
        resolved_spot:spots(id, name, area, category, photo_url, latitude, longitude)
      `)
      .eq("person_id", personId)
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) throw error;
    const saved = (data ?? []).map((row) => {
      const item = row as unknown as {
        id: string; normalized_url: string; provider: string; status: string;
        extracted_data: Record<string, unknown> | null;
        place_collection_items?: Array<{ collection?: { kind?: string } | null }>;
        resolved_spot?: { id: string; name: string; area: string; category: string; photo_url: string | null; latitude: number | null; longitude: number | null } | null;
      };
      const kind = item.place_collection_items?.[0]?.collection?.kind === "planning" ? "planning" : "want_to_try";
      const candidate = classifyPlaceLink(item.normalized_url);
      const spot = item.resolved_spot;
      const resolvedSpot = spot
        ? {
            id: spot.id, name: spot.name, area: spot.area, category: spot.category, photoUrl: spot.photo_url,
            latitude: spot.latitude, longitude: spot.longitude,
            mapsUrl: spot.latitude !== null && spot.longitude !== null ? MAPS_URL(spot.latitude, spot.longitude) : null,
          }
        : null;
      const extractedCandidates = item.status === "needs_input" ? item.extracted_data?.candidates ?? null : null;
      return {
        id: item.id, ...candidate, collection: kind as PlaceCollectionKind,
        status: item.status, resolvedSpot, candidates: extractedCandidates,
      };
    });
    return Response.json({ saved }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Saved places could not be loaded." }, { status: 500 });
  }
}
