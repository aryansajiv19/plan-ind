"use client";

import Image from "next/image";
import Link from "next/link";
import type { ProfileVisit } from "@/lib/types";

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

/**
 * One tile in the Been wall — same `.wall-tile` mechanism as PhotoTile
 * (SPECS.md §15.2: reuse it, not a new grid technique), but for a logged
 * visit rather than a catalogue spot: a real uploaded photo when one
 * exists, the visit's own note in the typographic fallback otherwise.
 */
export default function VisitTile({
  visit,
  photoUrl,
  height,
  priority = false,
}: {
  visit: ProfileVisit;
  photoUrl: string | null;
  height: number;
  priority?: boolean;
}) {
  const hasPhoto = Boolean(photoUrl);
  const name = visit.spot?.name ?? "A place that has since been removed";
  const meta = [visit.spot?.area, DATE_FORMAT.format(new Date(visit.visited_at))]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      className={`wall-tile ${hasPhoto ? "" : "wall-tile--typographic"}`}
      style={{ height }}
    >
      {hasPhoto ? (
        <Image
          src={photoUrl as string}
          alt=""
          fill
          sizes="(max-width: 720px) 50vw, 25vw"
          className="wall-tile__img"
          priority={priority}
          // A signed URL from the private visit-photos bucket — same posture
          // as PhotoTile's spot photos, the optimiser never fetches it.
          unoptimized
        />
      ) : null}

      <div className="wall-tile__body">
        <h3 className="wall-tile__name">{name}</h3>
        {meta ? <p className="wall-tile__meta">{meta}</p> : null}
        {!hasPhoto && visit.note ? (
          <p className="wall-tile__vibe">{visit.note}</p>
        ) : null}
      </div>

      {visit.companions.length > 0 ? (
        <p className="wall-tile__note">
          Went with {visit.companions.map((c) => c.name).join(", ")}
        </p>
      ) : null}

      {visit.spot ? (
        <Link href={`/place/${visit.spot.id}`} className="wall-tile__link" aria-label={name} />
      ) : null}
    </article>
  );
}
