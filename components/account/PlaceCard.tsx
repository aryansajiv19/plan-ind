import VenuePhoto, { hasVenuePhoto } from "@/components/VenuePhoto";
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
  return (
    <article
      className={`demo-place-card ${hasVenuePhoto(spot) ? "" : "demo-place-card--flat"}`}
    >
      {hasVenuePhoto(spot) ? (
        <div className="demo-place-card__image">
          <VenuePhoto spot={spot} sizes="(max-width: 700px) 100vw, 50vw" />
        </div>
      ) : (
        <div className="demo-place-card__code" aria-hidden="true">{meta.code}</div>
      )}
      <div className="demo-place-card__body">
        <div className="demo-place-card__meta">
          <span>{spot.cuisine || categoryLabel(spot.category)}</span>
          {hours && <span>{hours}</span>}
        </div>
        <h2>{spot.name}</h2>
        <p className="demo-place-card__area">{[spot.area, priceLabel(spot)].filter(Boolean).join(" · ")}</p>
        {spot.description && <p>{spot.description}</p>}
        {spot.vibe && <p className="demo-place-card__context">{spot.vibe}</p>}
        <button type="button" onClick={onStartPlan}>Start a vote with this place</button>
        {boards && <SaveToBoard spot={spot} boards={boards} />}
      </div>
    </article>
  );
}
