"use client";

import Image from "next/image";
import type { Spot } from "@/lib/types";

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
 * what exists. Do not pad the page." `Spot.photo_url` is a single nullable
 * column today and it is null for most rows, so the photo-less tile is not a
 * fallback here — it is the common case, and it is designed rather than
 * apologised for: the venue set in the display serif on a raised surface,
 * which reads as editorial rather than as a broken image.
 *
 * Overlay chips describe what happened, never what type of place it is. The
 * category rainbow was retired; a chip saying "Dinner" would be reintroducing
 * it in words.
 */
export default function PhotoTile({
  spot,
  note,
  height,
  priority = false,
}: {
  spot: Spot;
  note?: WallNote;
  height: number;
  priority?: boolean;
}) {
  const hasPhoto = Boolean(spot.photo_url);
  const meta = [spot.area, spot.min_spend ? `AED ${spot.min_spend}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      className={`wall-tile ${hasPhoto ? "" : "wall-tile--typographic"}`}
      style={{ height }}
    >
      {hasPhoto ? (
        <Image
          src={spot.photo_url as string}
          alt=""
          fill
          sizes="(max-width: 720px) 50vw, 25vw"
          className="wall-tile__img"
          priority={priority}
          // photo_url is unconstrained today — a data URI or an unproven host —
          // and next.config has no remotePatterns allowlist. Optimising it
          // would mean letting the image optimiser fetch arbitrary origins.
          unoptimized
        />
      ) : null}

      <div className="wall-tile__body">
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
    </article>
  );
}
