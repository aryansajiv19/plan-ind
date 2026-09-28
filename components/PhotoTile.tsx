"use client";

import Link from "next/link";
import type { Spot } from "@/lib/types";
import VenuePhoto from "@/components/VenuePhoto";
import { hasVenuePhoto } from "@/lib/venue-photo";
import { categoryLabel, categoryMeta } from "@/lib/categories";

export interface WallNote {
  /** What HAPPENED — "Sara + 2 saved", "In Friday's deal". Never the category. */
  text: string;
  /** A note about this week's plan reads as live; a saved-by note does not. */
  live?: boolean;
}

/**
 * One tile in the photo wall.
 *
 * The design handoff is emphatic that photography carries the aesthetic, and
 * equally emphatic about what to do when there isn't any: "say so and show
 * what exists. Do not pad the page." Most venues now have a photo (our own or
 * Google's, see VenuePhoto); the rest get a designed tile, the venue set in
 * the display face, never a broken image.
 *
 * Overlay chips describe what happened, never what type of place it is. The
 * category rainbow was retired; a chip saying "Dinner" would be reintroducing
 * it in words.
 */
export default function PhotoTile({
  spot,
  note,
  height,
}: {
  spot: Spot;
  note?: WallNote;
  height: number;
}) {
  const hasPhoto = hasVenuePhoto(spot);
  const meta = [spot.area, spot.min_spend ? `AED ${spot.min_spend}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      className={`wall-tile ${hasPhoto ? "" : "wall-tile--typographic"}`}
      style={{ height }}
    >
      <VenuePhoto spot={spot} sizes="(max-width: 720px) 50vw, 25vw" className="wall-tile__img" />

      <div className="wall-tile__body">
        {/* Photo-less tiles carry the category code as texture (no hue: the
            group colours are retired), where a photo would carry the mood. */}
        {!hasPhoto ? (
          <p className="wall-tile__code">{categoryMeta(spot.category).code} · {categoryLabel(spot.category)}</p>
        ) : null}
        <h3 className="wall-tile__name">{spot.name}</h3>
        {meta ? <p className="wall-tile__meta">{meta}</p> : null}
        {!hasPhoto && spot.vibe ? (
          <p className="wall-tile__vibe">{spot.vibe}</p>
        ) : null}
      </div>

      {note ? (
        <p className={`wall-tile__note ${note.live ? "wall-tile__note--live" : ""}`}>
          {note.text}
        </p>
      ) : null}

      {/* Stretched-link overlay: the whole card is the tap target without
          nesting an <article> inside an <a> (its content model, and it
          would put the note/image inside the link's accessible name).
          No shared-element morph — that needs React's <ViewTransition>,
          which is canary-only; this repo runs stable React 19. */}
      <Link href={`/place/${spot.id}`} className="wall-tile__link" aria-label={spot.name} />
    </article>
  );
}
