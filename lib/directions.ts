// "Getting there" — docs/archive/PRIORITIES-2026-09-18.md's Venue-link enrichment section,
// 2026-09-04 owner decision: straight-line distance + an "Open in Maps"
// deep link is the free-tier version, and it's the actual ask, not a
// placeholder for a real transit integration. Google Maps in Dubai already
// renders RTA's own live metro/bus/taxi data on the destination screen, so
// this one link answers "how do I get there" without this app building any
// transit API relationship — a direct RTA integration was researched, not
// assumed, and isn't the simple free thing it first looked like (real-time
// GTFS access is restricted to government/authorized users; the public
// mirror is stale since 2021). Not building toward transit timings here.

import { googleMapsPlaceUrl } from "./places/maps-url.ts";
import { dubaiHour } from "./dubai-phase.ts";

export const ROAD_CIRCUITY = 1.3;
export const DUBAI_RUSH_HOUR_KMH = 26.3;
const DRIVE_ESTIMATE_KM = { min: 1, max: 40 } as const;

/** Minutes, rounded to 5, or null when an estimate would mislead. */
export function driveMinutesEstimate(straightLineKm: number): number | null {
  if (!Number.isFinite(straightLineKm)) return null;
  if (straightLineKm < DRIVE_ESTIMATE_KM.min || straightLineKm > DRIVE_ESTIMATE_KM.max) return null;
  const minutes = ((straightLineKm * ROAD_CIRCUITY) / DUBAI_RUSH_HOUR_KMH) * 60;
  return Math.max(5, Math.round(minutes / 5) * 5);
}

// ── Opening a venue in a maps app ────────────────────────────────────────
export interface MappableVenue {
  name: string;
  area: string;
  address?: string | null;
  latitude: number | null;
  longitude: number | null;
  /** 063 (staged): when present, pins the exact Google place. */
  google_place_id?: string | null;
}

const hasCoords = (v: MappableVenue) => v.latitude != null && v.longitude != null;
const searchText = (v: MappableVenue) => v.address || `${v.name}, ${v.area}, Dubai`;

/** Google Maps deep link: the place id when stored, coordinates, else the name. */
export function googleMapsUrl(venue: MappableVenue): string {
  const pinned = googleMapsPlaceUrl(venue.name, venue.google_place_id);
  if (pinned) return pinned;
  const query = hasCoords(venue) ? `${venue.latitude},${venue.longitude}` : searchText(venue);
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query })}`;
}

/** Apple Maps deep link: a named pin at the coordinates when known. */
export function appleMapsUrl(venue: MappableVenue): string {
  const params = new URLSearchParams({ q: hasCoords(venue) ? venue.name : searchText(venue) });
  if (hasCoords(venue)) params.set("ll", `${venue.latitude},${venue.longitude}`);
  return `https://maps.apple.com/?${params}`;
}

/**
 * The in-app map's iframe src. The one place that knows the embed URL.
 *
 * Keyless today: the legacy `output=embed` form. When a Maps Embed API key
 * exists, the swap is this return line, e.g.
 *   `https://www.google.com/maps/embed/v1/place?${new URLSearchParams({ key, q: query, zoom: "15" })}`
 * Same host, so proxy.ts's frame-src does not change. Restrict that key by
 * HTTP referrer to the site ORIGIN: VenueMap sends `strict-origin`, never the
 * path (a plan page's path is its id).
 */
export function mapEmbedUrl(venue: MappableVenue): string {
  const query = hasCoords(venue) ? `${venue.latitude},${venue.longitude}` : `${venue.name}, ${venue.area}, Dubai`;
  return `https://www.google.com/maps?${new URLSearchParams({ q: query, z: "15", output: "embed" })}`;
}

// ── Get there (P16): one tap from wherever the viewer is ─────────────────

export type TravelMode = "driving" | "transit" | "walking";

const destinationOf = (v: MappableVenue) => (hasCoords(v) ? `${v.latitude},${v.longitude}` : searchText(v));

/**
 * Google Maps directions, keyless. With no origin Maps starts from the
 * device's own location, which is what most viewers want (most plans keep
 * the default "anywhere" origin). The stored place id pins the exact venue.
 */
export function directionsUrl(
  venue: MappableVenue,
  mode: TravelMode,
  origin: { latitude: number; longitude: number } | null = null,
): string {
  const params = new URLSearchParams({ api: "1", destination: destinationOf(venue), travelmode: mode });
  if (venue.google_place_id) params.set("destination_place_id", venue.google_place_id);
  if (origin) params.set("origin", `${origin.latitude},${origin.longitude}`);
  return `https://www.google.com/maps/dir/?${params}`;
}

/** Apple Maps directions from the current location (no saddr). */
export function appleDirectionsUrl(venue: MappableVenue, mode: TravelMode): string {
  const dirflg = mode === "driving" ? "d" : mode === "walking" ? "w" : "r";
  return `https://maps.apple.com/?${new URLSearchParams({ daddr: destinationOf(venue), dirflg })}`;
}

/**
 * Uber's documented universal link (developer.uber.com, deep links:
 * m.uber.com/looking with a JSON drop[0]), pickup at the rider's location.
 * Null without coordinates: Uber needs a point, not a name.
 */
export function uberUrl(venue: MappableVenue): string | null {
  if (!hasCoords(venue)) return null;
  const drop = JSON.stringify({ latitude: venue.latitude, longitude: venue.longitude, addressLine1: venue.name });
  return `https://m.uber.com/looking?${new URLSearchParams({ pickup: "my_location", "drop[0]": drop })}`;
}

/** Dubai's peaks, 7-10 and 17-20 on the Dubai clock: when "rush hour" is true. */
export function isDubaiRushHour(now: Date): boolean {
  const hour = dubaiHour(now);
  return (hour >= 7 && hour < 10) || (hour >= 17 && hour < 20);
}

/** Minutes spare for parking or walking in, on top of the travel time. */
export const LEAVE_BY_SPARE_MIN = 10;

/**
 * When to set off: the event time less the travel and a little spare,
 * rounded down to 5 minutes. Null once that moment has passed or without
 * both inputs, so a late viewer isn't told to leave in the past.
 */
export function leaveBy(eventIso: string | null, travelMin: number | null, now: Date = new Date()): Date | null {
  if (!eventIso || travelMin == null) return null;
  const at = new Date(eventIso).getTime() - (travelMin + LEAVE_BY_SPARE_MIN) * 60_000;
  const rounded = Math.floor(at / 300_000) * 300_000;
  return rounded > now.getTime() ? new Date(rounded) : null;
}
