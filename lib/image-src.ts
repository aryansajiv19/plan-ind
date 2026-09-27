// The image sources next/image may optimise: our own licensed venue photos in
// public/venues, and our own public spot-photos bucket over https
// (next.config.ts allows exactly this in remotePatterns).
// Everything else stays unoptimized: Google Places photo URIs may not be
// cached under the Maps terms (docs/PLACES_INGESTION_SCOPE.md), and Next 16
// refuses to optimise a private IP, which is what the local stack serves from.
export const SPOT_PHOTOS_PATH = "/storage/v1/object/public/spot-photos/";

export function spotPhotoHost(supabaseUrl: string | undefined): string | null {
  try {
    const url = new URL(supabaseUrl ?? "");
    return url.protocol === "https:" && !url.port ? url.hostname : null;
  } catch {
    return null;
  }
}

const VENUE_PHOTO = /^\/venues\/[a-z0-9-]+\.webp$/;

export function canOptimiseImage(
  src: string,
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
): boolean {
  if (VENUE_PHOTO.test(src)) return true;
  const host = spotPhotoHost(supabaseUrl);
  if (!host) return false;
  try {
    const url = new URL(src);
    return url.protocol === "https:" && url.host === host && url.pathname.startsWith(SPOT_PHOTOS_PATH);
  } catch {
    return false;
  }
}
