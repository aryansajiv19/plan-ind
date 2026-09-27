"use client";

import Link from "next/link";
import VenuePhoto, { hasVenuePhoto } from "@/components/VenuePhoto";
import { categoryLabel } from "@/lib/categories";
import { hoursLabel } from "@/lib/open-hours";
import { safeExternalUrl, type BoardSpot } from "@/lib/social";
import type { MoodboardItem } from "@/lib/types";

/** Photo tiles alternate between these so the columns never rhyme. */
const RATIOS = ["4 / 5", "1 / 1", "3 / 4", "5 / 4"];

/**
 * One pin on a board. A place carries its spot data (spend, hours, vibe,
 * area) because that is what the group decides on; a link carries its host
 * so nobody taps into an unknown site. Heights vary with the content and
 * the photo's frame, which is what makes the columns read as a board.
 */
export default function MoodboardTile({
  item,
  spot,
  index,
  onRemove,
  removing,
}: {
  item: MoodboardItem;
  /** The catalogue row for a place item, when it could be read. */
  spot: BoardSpot | undefined;
  index: number;
  onRemove: () => void;
  removing: boolean;
}) {
  const link = item.kind === "link" ? safeExternalUrl(item.source_url) : null;
  const placeHref = spot ? `/place/${spot.id}` : null;
  const photo = spot ? hasVenuePhoto(spot) : false;
  const name = spot?.name ?? item.label;

  return (
    <article className={`wall-tile board-tile ${photo ? "" : "wall-tile--typographic"}`}>
      {photo && spot && (
        <div className="board-tile__photo" style={{ aspectRatio: RATIOS[index % RATIOS.length] }}>
          <VenuePhoto spot={spot} sizes="(max-width: 760px) 50vw, 25vw" />
        </div>
      )}
      <div className="board-tile__body">
        <p className="board-tile__kicker">
          {item.kind === "place" ? (spot ? spot.cuisine || categoryLabel(spot.category) : "Place") : item.kind === "link" ? "Link" : "Photo"}
        </p>
        <h3>{name}</h3>
        {spot && (
          <p>
            {[spot.area, spot.min_spend > 0 ? `AED ${spot.min_spend} pp` : spot.price_band, hoursLabel(spot.open_till)].filter(Boolean).join(" · ")}
          </p>
        )}
        {spot?.vibe && <p>{spot.vibe}</p>}
        {link && <p>{new URL(link).hostname.replace(/^www\./, "")}</p>}
        {item.note && <p className="board-tile__note">{item.note}</p>}
      </div>
      <div className="board-tile__actions">
        {placeHref && <Link href={placeHref}>Open place</Link>}
        {link && <a href={link} target="_blank" rel="noopener noreferrer">Open link</a>}
        <button type="button" onClick={onRemove} disabled={removing} aria-label={`Remove ${name} from this board`}>
          {removing ? "Removing…" : "Remove"}
        </button>
      </div>
    </article>
  );
}
