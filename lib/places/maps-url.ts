// A Google Maps link for a spot, built from the stored place id with the
// public Maps URLs scheme (no key, no API call, not Google content -- which
// is why google_maps_uri is not a column). Safe to import from the client.
//
// https://www.google.com/maps/search/?api=1&query=<name>&query_place_id=<id>
// `query` is required by the scheme and is only a fallback label when the
// id resolves; the id is what pins the place.

const PLACE_ID = /^[A-Za-z0-9_-]{10,255}$/;

export function googleMapsPlaceUrl(name: string, placeId: string | null | undefined): string | null {
  if (!placeId || !PLACE_ID.test(placeId)) return null;
  const query = new URLSearchParams({ api: "1", query: name.slice(0, 200), query_place_id: placeId });
  return `https://www.google.com/maps/search/?${query}`;
}
