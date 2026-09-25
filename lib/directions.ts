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

const EARTH_RADIUS_KM = 6371;

/** Straight-line distance in km between two points — pure math, no API. */
export function haversineKm(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(destLat - originLat);
  const dLng = toRad(destLng - originLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(originLat)) * Math.cos(toRad(destLat)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * A Google Maps directions deep link, transit-mode by default — no API key.
 * Tapping through lands on Maps' own live RTA-sourced metro/bus/taxi
 * options for the route, which is the actual feature here.
 */
export function directionsUrl(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): string {
  const params = new URLSearchParams({
    api: "1",
    origin: `${originLat},${originLng}`,
    destination: `${destLat},${destLng}`,
    travelmode: "transit",
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

// ── Rough drive time ─────────────────────────────────────────────────────
// Straight-line km is not road km, and there is no routing API here, so this
// is a labelled estimate, never a promise. Two documented assumptions:
//   - Road distance ≈ 1.3 × straight line: the usual urban circuity factor
//     (studies of real road networks land around 1.2 to 1.4).
//   - 26.3 km/h: TomTom Traffic Index 2025, Dubai's average rush-hour speed
//     (reported by Khaleej Times). Pessimistic for a late dinner, which is the
//     honest direction to be wrong in; the UI says "in rush hour".
// Under 1 km a drive estimate is noise; past 40 km the trip is mostly
// highway, where a city rush-hour speed would badly overstate it. Both
// return null and nothing is shown.
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
