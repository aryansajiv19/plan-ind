// "Getting there" — PRIORITIES.md's Venue-link enrichment section,
// 2026-09-04 owner decision: straight-line distance + an "Open in Maps"
// deep link is the free-tier version, and it's the actual ask, not a
// placeholder for a real transit integration. Google Maps in Dubai already
// renders RTA's own live metro/bus/taxi data on the destination screen, so
// this one link answers "how do I get there" without this app building any
// transit API relationship — a direct RTA integration was researched, not
// assumed, and isn't the simple free thing it first looked like (real-time
// GTFS access is restricted to government/authorized users; the public
// mirror is stale since 2021). Not building toward transit timings here.

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
