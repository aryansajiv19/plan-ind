import Image from "next/image";
import PhotoCredit from "@/components/PhotoCredit";
import { categoryLabel, categoryMeta } from "@/lib/categories";
import type { Spot } from "@/lib/types";

function priceLabel(spot: Spot): string {
  return spot.min_spend > 0 ? `AED ${spot.min_spend} pp` : spot.price_band;
}

/** A place card. Curated spots often have no photo yet, so the typographic
 *  category code stands in rather than a stock image. */
export default function PlaceCard({ spot, onStartPlan }: { spot: Spot; onStartPlan: () => void }) {
  const meta = categoryMeta(spot.category);
  return (
    <article
      className={`demo-place-card ${spot.photo_url ? "" : "demo-place-card--flat"}`}
    >
      {spot.photo_url ? (
        <div className="demo-place-card__image">
          <Image src={spot.photo_url} alt={`${spot.name}, ${spot.area}`} fill sizes="(max-width: 700px) 100vw, 50vw" unoptimized />
          <PhotoCredit spot={spot} />
        </div>
      ) : (
        <div className="demo-place-card__code" aria-hidden="true">{meta.code}</div>
      )}
      <div className="demo-place-card__body">
        <div className="demo-place-card__meta">
          <span>{spot.cuisine || categoryLabel(spot.category)}</span>
          <span>Open till {spot.open_till}</span>
        </div>
        <h2>{spot.name}</h2>
        <p className="demo-place-card__area">{spot.area} · {priceLabel(spot)}</p>
        {spot.description && <p>{spot.description}</p>}
        {spot.vibe && <p className="demo-place-card__context">{spot.vibe}</p>}
        <button type="button" onClick={onStartPlan}>Start a vote with this place</button>
      </div>
    </article>
  );
}
