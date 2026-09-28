import type { Plan, Spot } from "@/lib/types";
import { driveMinutesEstimate, googleMapsUrl, isDubaiRushHour } from "@/lib/directions";
import { distanceKm } from "@/lib/dubai-areas";
import { useMinuteClock } from "@/hooks/use-minute-clock";
import GetThere from "@/components/GetThere";
import { metroLine } from "@/lib/dubai-metro";
import RouteMap from "@/components/route/RouteMap";

// The decided plan's "Where": the address, how far it is from the plan's
// start point, deep links into the maps apps people already use (the
// primary action), and an in-app map that loads only when reached.
//
// Distance is straight-line and only when both ends have coordinates; a plan
// created before an origin was picked has nothing honest to say about it.
// The drive time is a labelled rush-hour estimate (lib/directions.ts).

export default function GettingThere({ plan, winner }: { plan: Pick<Plan, "origin_latitude" | "origin_longitude" | "origin_label">; winner: Spot }) {
  const km =
    plan.origin_latitude != null && plan.origin_longitude != null
    && winner.latitude != null && winner.longitude != null
      ? distanceKm(
        { latitude: plan.origin_latitude, longitude: plan.origin_longitude },
        { latitude: winner.latitude, longitude: winner.longitude },
      )
      : null;
  const drive = km != null ? driveMinutesEstimate(km) : null;
  // The estimate is at peak speed: say "in rush hour" only at the peaks (P16).
  const now = useMinuteClock();
  const metro = metroLine(winner); // P17
  const rush = now != null && isDubaiRushHour(now);

  return (
    <div className="mt-4 border-t border-line pt-4">
      <p className="text-xs font-bold uppercase tracking-wide text-muted">Where</p>
      <p className="mt-1 text-sm">{winner.address ?? `${winner.area}, Dubai`}</p>
      {metro && <p className="mt-1 text-sm text-muted">{metro}</p>}
      {km != null && (
        <p className="mt-1 text-sm font-medium">
          {Math.round(km * 10) / 10} km from {plan.origin_label ?? "your start point"}
          {drive != null && <span className="text-muted"> · ≈ {drive} min drive {rush ? "in rush hour" : "(estimate)"}</span>}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium">
        <a href={googleMapsUrl(winner)} target="_blank" rel="noopener noreferrer" className="text-grape underline">
          Open in Google Maps
        </a>
      </div>
      <GetThere venue={winner} className="mt-2" />
      <RouteMap
        venue={winner}
        planOrigin={plan.origin_latitude != null && plan.origin_longitude != null ? { latitude: plan.origin_latitude, longitude: plan.origin_longitude } : null}
      />
    </div>
  );
}
