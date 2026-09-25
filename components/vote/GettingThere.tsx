import type { Plan, Spot } from "@/lib/types";
import { appleMapsUrl, directionsUrl, driveMinutesEstimate, googleMapsUrl, haversineKm } from "@/lib/directions";
import VenueMap from "@/components/VenueMap";

// The decided plan's "Where": the address, how far it is from the plan's
// start point, deep links into the maps apps people already use (the
// primary action), and an in-app map that loads only when reached.
//
// Distance is straight-line and only when both ends have coordinates; a plan
// created before an origin was picked has nothing honest to say about it.
// The drive time is a labelled rush-hour estimate (lib/directions.ts).

export default function GettingThere({ plan, winner }: { plan: Plan; winner: Spot }) {
  const route =
    plan.origin_latitude != null && plan.origin_longitude != null
    && winner.latitude != null && winner.longitude != null
      ? [plan.origin_latitude, plan.origin_longitude, winner.latitude, winner.longitude] as const
      : null;
  const km = route ? haversineKm(...route) : null;
  const drive = km != null ? driveMinutesEstimate(km) : null;

  return (
    <div className="mt-4 border-t border-line pt-4">
      <p className="text-xs font-bold uppercase tracking-wide text-muted">Where</p>
      <p className="mt-1 text-sm">{winner.address ?? `${winner.area}, Dubai`}</p>
      {km != null && (
        <p className="mt-1 text-sm font-medium">
          {Math.round(km * 10) / 10} km from {plan.origin_label ?? "your start point"}
          {drive != null && <span className="text-muted"> · ≈ {drive} min drive in rush hour</span>}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium">
        <a href={googleMapsUrl(winner)} target="_blank" rel="noopener noreferrer" className="text-grape underline">
          Open in Google Maps
        </a>
        <a href={appleMapsUrl(winner)} target="_blank" rel="noopener noreferrer" className="text-grape underline">
          Apple Maps
        </a>
        {route && (
          <a href={directionsUrl(...route)} target="_blank" rel="noopener noreferrer" className="text-grape underline">
            Live transit options
          </a>
        )}
      </div>
      <VenueMap venue={winner} />
    </div>
  );
}
