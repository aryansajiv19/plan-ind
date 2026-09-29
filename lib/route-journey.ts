// The animated route on our own map (components/map/RouteJourney.tsx): the
// legs from where you are to the venue, each with the one line you need at
// that point ("Board the Red Line at Union", "Park: valet at the entrance").
// Metro legs follow the real line through its stations (fewest stops, one
// graph search over lib/metro-lines.ts); walking and driving are drawn as a
// gentle curve, because we hold no street data, and every time is labelled an
// estimate. Pure: no DOM, no network.
import { distanceKm, type Coordinates } from "@/lib/dubai-areas";
import { nearestStation, type MetroStation } from "@/lib/dubai-metro";
import { METRO_LINES } from "@/lib/metro-lines";
import { driveMinutesEstimate } from "@/lib/directions";

export type JourneyMode = "TRANSIT" | "DRIVING" | "WALKING";

export interface Pt {
  lat: number;
  lng: number;
}

export interface Leg {
  kind: "walk" | "metro" | "drive";
  points: Pt[];
  /** Metro legs: the line colour. */
  line?: "Red" | "Green";
  /** Walk and drive legs are drawn curved (no street data). */
  curved: boolean;
  note: string;
  noteAt: Pt;
}

export interface Journey {
  legs: Leg[];
  /** A one-line total, always marked as an estimate. */
  summary: string;
  /** The mode actually drawn: transit with no metro nearby falls back to a drive. */
  drawn: JourneyMode;
}

interface Venue {
  latitude: number | null;
  longitude: number | null;
  parking?: string | null;
}

const pt = (s: MetroStation): Pt => ({ lat: s.lat, lng: s.lng });
const toPt = (c: Coordinates): Pt => ({ lat: c.latitude, lng: c.longitude });
const WALK_KMH = 4.8;
const walkMinutes = (km: number) => Math.max(1, Math.round(((km * 1.3) / WALK_KMH) * 60));

type Edge = { to: string; line: "red" | "route2020" | "green"; color: "Red" | "Green" };

const GRAPH = (() => {
  const g = new Map<string, Edge[]>();
  for (const line of METRO_LINES) {
    line.stations.forEach((s, i) => {
      const add = (a: MetroStation, b: MetroStation) => {
        const list = g.get(a.name) ?? [];
        list.push({ to: b.name, line: line.key, color: line.color });
        g.set(a.name, list);
      };
      if (i > 0) {
        add(s, line.stations[i - 1]);
        add(line.stations[i - 1], s);
      }
    });
  }
  return g;
})();
const STATION = new Map(METRO_LINES.flatMap((l) => l.stations).map((s) => [s.name, s]));

/**
 * Fewest stops from one station to another, grouped into rides: one per line
 * (a change of line starts a new ride). Null when unconnected.
 */
export function metroRides(from: string, to: string): { color: "Red" | "Green"; stations: MetroStation[] }[] | null {
  if (!STATION.has(from) || !STATION.has(to)) return null;
  const prev = new Map<string, { from: string; edge: Edge } | null>([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const at = queue.shift()!;
    if (at === to) break;
    for (const edge of GRAPH.get(at) ?? []) {
      if (prev.has(edge.to)) continue;
      prev.set(edge.to, { from: at, edge });
      queue.push(edge.to);
    }
  }
  if (!prev.has(to)) return null;
  const path: { name: string; edge: Edge }[] = [];
  for (let at = to; prev.get(at); at = prev.get(at)!.from) path.unshift({ name: at, edge: prev.get(at)!.edge });

  const rides: { line: string; color: "Red" | "Green"; stations: MetroStation[] }[] = [];
  let last = STATION.get(from)!;
  for (const step of path) {
    const ride = rides.at(-1);
    // Route 2020 runs through to the Red Line: one ride, not a change.
    const sameRide = ride && (ride.line === step.edge.line || (ride.color === "Red" && step.edge.color === "Red"));
    if (sameRide) ride.stations.push(STATION.get(step.name)!);
    else rides.push({ line: step.edge.line, color: step.edge.color, stations: [last, STATION.get(step.name)!] });
    last = STATION.get(step.name)!;
  }
  return rides.map(({ color, stations }) => ({ color, stations }));
}

const midpoint = (a: Pt, b: Pt): Pt => ({ lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 });

function driveJourney(from: Pt, to: Pt, venue: Venue, lead?: string): Journey {
  const km = distanceKm({ latitude: from.lat, longitude: from.lng }, { latitude: to.lat, longitude: to.lng });
  const min = driveMinutesEstimate(km);
  const parking = venue.parking?.trim();
  return {
    drawn: "DRIVING",
    summary: `${min != null ? `≈ ${min} min drive` : "A short drive"} (estimate)`,
    legs: [
      { kind: "drive", curved: true, points: [from, to], note: lead ?? (min != null ? `Drive ≈ ${min} min` : "Drive"), noteAt: midpoint(from, to) },
      { kind: "drive", curved: false, points: [to], note: parking ? `Park: ${parking}` : "Drop off at the entrance", noteAt: to },
    ],
  };
}

export function journey(origin: Coordinates, venue: Venue, mode: JourneyMode): Journey | null {
  if (venue.latitude == null || venue.longitude == null) return null;
  const from = toPt(origin);
  const to: Pt = { lat: venue.latitude, lng: venue.longitude };

  if (mode === "DRIVING") return driveJourney(from, to, venue);

  if (mode === "WALKING") {
    const min = walkMinutes(distanceKm(origin, { latitude: to.lat, longitude: to.lng }));
    return {
      drawn: "WALKING",
      summary: `≈ ${min} min walk (estimate)`,
      legs: [{ kind: "walk", curved: true, points: [from, to], note: `Walk ≈ ${min} min`, noteAt: midpoint(from, to) }],
    };
  }

  const start = nearestStation(from.lat, from.lng);
  const end = nearestStation(to.lat, to.lng);
  const rides = start && end && start.walkable && end.walkable && start.station.name !== end.station.name
    ? metroRides(start.station.name, end.station.name)
    : null;
  if (!start || !end || !rides) return driveJourney(from, to, venue, "No metro close enough: a taxi is quicker");

  const legs: Leg[] = [
    { kind: "walk", curved: true, points: [from, pt(start.station)], note: `Walk ≈ ${start.walkMin} min to ${start.station.name}`, noteAt: midpoint(from, pt(start.station)) },
  ];
  rides.forEach((ride, i) => {
    const first = ride.stations[0];
    const stops = ride.stations.length - 1;
    legs.push({
      kind: "metro",
      curved: false,
      line: ride.color,
      points: ride.stations.map(pt),
      note: `${i === 0 ? "Board" : "Change to"} the ${ride.color} Line at ${first.name} · ${stops} ${stops === 1 ? "stop" : "stops"}`,
      noteAt: pt(first),
    });
  });
  legs.push({
    kind: "walk",
    curved: true,
    points: [pt(end.station), to],
    note: `Get off at ${end.station.name}, walk ≈ ${end.walkMin} min`,
    noteAt: pt(end.station),
  });
  const stops = rides.reduce((n, r) => n + r.stations.length - 1, 0);
  return {
    drawn: "TRANSIT",
    summary: `Metro, ${stops} ${stops === 1 ? "stop" : "stops"}${rides.length > 1 ? `, ${rides.length - 1} change` : ""}, plus ≈ ${start.walkMin + end.walkMin} min walking (estimate)`,
    legs,
  };
}
