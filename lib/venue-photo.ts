import type { Spot } from "@/lib/types";

// Plain module, not "use client": server components (the place page) call
// hasVenuePhoto too, and a function exported from a client module is only a
// reference on the server -- calling it there throws.

export type PhotoSpot = Pick<Spot, "id" | "photo_url" | "photo_attribution"> & { google_place_id?: string | null; category?: string; cuisine?: string | null };

/** A real photograph: our own, or a matched Google place's where Google photos are on. */
export const hasRealPhoto = (spot: PhotoSpot, google = true) => Boolean(spot.photo_url || (google && spot.google_place_id));

/**
 * A card lays out around a picture when it has a real photo or, failing
 * that, a known category: VenuePhoto then draws its CategoryArt, so no
 * photo box is ever empty (owner, 2026-09-29).
 */
export const hasVenuePhoto = (spot: PhotoSpot, google = true) => hasRealPhoto(spot, google) || Boolean(spot.category);
