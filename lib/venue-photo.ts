import type { Spot } from "@/lib/types";

// Plain module, not "use client": server components (the place page) call
// hasVenuePhoto too, and a function exported from a client module is only a
// reference on the server -- calling it there throws.

export type PhotoSpot = Pick<Spot, "id" | "photo_url" | "photo_attribution"> & { google_place_id?: string | null };

/** A card lays out around a photo when it has our own or a matched Google place's. */
export const hasVenuePhoto = (spot: PhotoSpot) => Boolean(spot.photo_url || spot.google_place_id);
