import type { Spot } from "@/lib/types";

/**
 * The credit line for a venue photo.
 *
 * This is a LICENCE OBLIGATION, not a caption. Several curated photos are
 * CC-BY, where attribution is a condition of use — rendering the image
 * without it puts the app in breach. `lib/types.ts` says the same thing on
 * the column itself: "Anything rendering photo_url must render this beside
 * it when non-null."
 *
 * One component rather than four copies, because the requirement is
 * identical everywhere a spot photo appears and a copy that drifts is a
 * copy that silently stops complying.
 *
 * Renders nothing when there is no photo or no attribution: an empty
 * credit line is noise, and a credit with no image is meaningless.
 */
export default function PhotoCredit({
  spot,
  className = "",
}: {
  spot: Pick<Spot, "photo_url" | "photo_attribution">;
  className?: string;
}) {
  if (!spot.photo_url || !spot.photo_attribution) return null;
  return (
    <span className={`photo-credit ${className}`.trim()}>{spot.photo_attribution}</span>
  );
}
