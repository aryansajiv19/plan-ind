import { distanceKm, type Coordinates } from "@/lib/dubai-areas";
import { nearestStation } from "@/lib/dubai-metro";
import { driveMinutesEstimate } from "@/lib/directions";

// The route map's step list. From Google (Routes library, Route.computeRoutes)
// when a browser key exists, else the metro estimate from lib/dubai-metro.ts.
// No routing is ours: Google's steps are only reshaped for reading, and the
// fallback says "estimate" on every line.

/** The subset of a Routes-library RouteLegStep this reads. */
export interface ApiStep {
  travelMode?: string | null;
  instructions?: string | null;
  staticDurationMillis?: number | null;
  transitDetails?: {
    stopCount?: number | null;
    headsign?: string | null;
    departureStop?: { name?: string | null } | null;
    arrivalStop?: { name?: string | null } | null;
    transitLine?: { name?: string | null; nameShort?: string | null; vehicle?: { name?: string | null } | null } | null;
  } | null;
}

const minutes = (ms: number | null | undefined) => Math.max(1, Math.round((ms ?? 0) / 60_000));

/**
 * Transit: consecutive walking steps fold into one "Walk N min", and each ride
 * reads "Red Line, 4 stops: Business Bay → Mall of the Emirates". Driving and
 * walking keep Google's turn-by-turn instructions.
 */
export function routeSteps(steps: ApiStep[], mode: "TRANSIT" | "DRIVING" | "WALKING"): string[] {
  if (mode !== "TRANSIT") return steps.map((step) => step.instructions?.trim()).filter((text): text is string => Boolean(text));
  const out: string[] = [];
  let walkMs = 0;
  const flushWalk = () => {
    if (walkMs > 0) out.push(`Walk ${minutes(walkMs)} min`);
    walkMs = 0;
  };
  for (const step of steps) {
    const ride = step.transitDetails;
    if (!ride) {
      walkMs += step.staticDurationMillis ?? 0;
      continue;
    }
    flushWalk();
    const line = ride.transitLine?.nameShort || ride.transitLine?.name || ride.transitLine?.vehicle?.name || "Transit";
    const stops = ride.stopCount ? `, ${ride.stopCount} ${ride.stopCount === 1 ? "stop" : "stops"}` : "";
    const from = ride.departureStop?.name;
    const to = ride.arrivalStop?.name;
    out.push(`${line}${stops}${from && to ? `: ${from} → ${to}` : ""}`);
  }
  flushWalk();
  return out;
}

/**
 * No key, or Google failed: nearest station at each end, the line(s) between
 * them, and the drive estimate. Null without coordinates at both ends.
 */
export function metroEstimate(origin: Coordinates | null, venue: { latitude: number | null; longitude: number | null }): { steps: string[]; driveMin: number | null } | null {
  if (!origin || venue.latitude == null || venue.longitude == null) return null;
  const driveMin = driveMinutesEstimate(distanceKm(origin, { latitude: venue.latitude, longitude: venue.longitude }));
  const start = nearestStation(origin.latitude, origin.longitude);
  const end = nearestStation(venue.latitude, venue.longitude);
  if (!start || !end || !start.walkable || !end.walkable || start.station.name === end.station.name) {
    return { steps: [], driveMin };
  }
  const shared = start.station.lines.find((line) => end.station.lines.includes(line));
  return {
    steps: [
      `Walk ≈ ${start.walkMin} min to ${start.station.name}`,
      shared
        ? `${shared} line to ${end.station.name}`
        : `Red and Green lines to ${end.station.name}, changing at Union or BurJuman`,
      `Walk ≈ ${end.walkMin} min to the venue`,
    ],
    driveMin,
  };
}
