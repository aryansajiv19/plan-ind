// The one image source next/image may optimise: our own public spot-photos
// bucket over https (next.config.ts allows exactly this in remotePatterns).
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

export function canOptimiseImage(
  src: string,
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
): boolean {
  const host = spotPhotoHost(supabaseUrl);
  if (!host) return false;
  try {
    const url = new URL(src);
    return url.protocol === "https:" && url.host === host && url.pathname.startsWith(SPOT_PHOTOS_PATH);
  } catch {
    return false;
  }
}
