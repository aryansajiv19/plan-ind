import VenuePhoto from "@/components/VenuePhoto";
import { hasVenuePhoto } from "@/lib/venue-photo";
import SaveToBoard from "@/components/account/SaveToBoard";
import type { MoodboardsState } from "@/components/account/useMoodboards";
import { categoryLabel, categoryMeta } from "@/lib/categories";
import { hoursLabel } from "@/lib/open-hours";
import { priceLabel } from "@/lib/price";
import type { Spot } from "@/lib/types";

/** A place card. Curated spots often have no photo yet, so the typographic
 *  category code stands in rather than a stock image. */
export default function PlaceCard({
  spot,
  onStartPlan,
  boards,
}: {
  spot: Spot;
  onStartPlan: () => void;
  /** Absent on surfaces with no account behind them. */
  boards?: MoodboardsState;
}) {
  const meta = categoryMeta(spot.category);
  const hours = hoursLabel(spot.open_till);
  const photo = hasVenuePhoto(spot);
  return (
    <article className="demo-place-card">
      {/* A listing: the photo (or a plain band) with the name set over its
          foot, as the vote card does; the facts run underneath. */}
      <div className="demo-place-card__band" data-photo={photo || undefined} data-code={meta.code}>
        {photo && <VenuePhoto spot={spot} sizes="(max-width: 700px) 100vw, 20rem" />}
        <div className="demo-place-card__over">
          <span className="demo-place-card__chip" aria-hidden="true">{meta.code}</span>
          <div>
            <h2>{spot.name}</h2>
            <p className="demo-place-card__area">{[spot.area, priceLabel(spot)].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
      </div>
      <div className="demo-place-card__body">
        <div className="demo-place-card__meta">
          <span>{spot.cuisine || categoryLabel(spot.category)}</span>
          {hours && <span>{hours}</span>}
        </div>
        {spot.description && <p>{spot.description}</p>}
        {spot.vibe && <p className="demo-place-card__context">{spot.vibe}</p>}
        <button type="button" onClick={onStartPlan}>Start a vote with this place</button>
        {boards && <SaveToBoard spot={spot} boards={boards} />}
      </div>
    </article>
  );
}
