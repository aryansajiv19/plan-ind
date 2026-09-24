import "server-only";

// GOOGLE_PLACES_API_KEY is server-only by construction: this module cannot
// be imported into a client bundle ("server-only" breaks the build), and the
// name deliberately has no NEXT_PUBLIC_ prefix, so Next never inlines it.
// Restrict the key in Google Cloud to the Places API (New) only.
export function placesApiKey(): string | null {
  const key = process.env.GOOGLE_PLACES_API_KEY?.trim();
  return key ? key : null;
}
