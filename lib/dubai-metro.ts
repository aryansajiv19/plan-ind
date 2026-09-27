// Dubai Metro stations (Red, incl. Route 2020, and Green), for "do I need
// the metro?" without a transit API (P17). From OpenStreetMap via Overpass,
// snapshot 2026-09-27 (data/venue-facts.json), © OpenStreetMap contributors,
// ODbL. Stations on both lines (Union, BurJuman) carry both.
import { distanceKm } from "./dubai-areas.ts";

export interface MetroStation { name: string; lines: ("Red" | "Green")[]; lat: number; lng: number }

export const METRO_STATIONS: readonly MetroStation[] = [
  { name: "Abu Baker Al Siddique", lines: ["Green"], lat: 25.2708929, lng: 55.3327545 },
  { name: "Abu Hail", lines: ["Green"], lat: 25.2754161, lng: 55.3464499 },
  { name: "Al Ghubaiba", lines: ["Green"], lat: 25.2650351, lng: 55.2889404 },
  { name: "Al Jadaf", lines: ["Green"], lat: 25.2249103, lng: 55.3337479 },
  { name: "Al Nahda", lines: ["Green"], lat: 25.2732083, lng: 55.3694757 },
  { name: "Al Qiyadah", lines: ["Green"], lat: 25.2775853, lng: 55.3526309 },
  { name: "Al Qusais", lines: ["Green"], lat: 25.2627427, lng: 55.3872735 },
  { name: "Al Ras", lines: ["Green"], lat: 25.2687742, lng: 55.2936231 },
  { name: "Baniyas Square", lines: ["Green"], lat: 25.2691743, lng: 55.3076094 },
  { name: "Creek", lines: ["Green"], lat: 25.2188806, lng: 55.3390384 },
  { name: "Dubai Airport Free Zone", lines: ["Green"], lat: 25.2698284, lng: 55.3751502 },
  { name: "Dubai Healthcare City", lines: ["Green"], lat: 25.2309528, lng: 55.322619 },
  { name: "Gold Souq", lines: ["Green"], lat: 25.2761408, lng: 55.3016752 },
  { name: "Oud Metha", lines: ["Green"], lat: 25.2439301, lng: 55.3158939 },
  { name: "Salah Al Din", lines: ["Green"], lat: 25.2703152, lng: 55.3208284 },
  { name: "Sharaf DG", lines: ["Green"], lat: 25.2582139, lng: 55.2974781 },
  { name: "Stadium", lines: ["Green"], lat: 25.27791, lng: 55.361466 },
  { name: "e&", lines: ["Green"], lat: 25.2547338, lng: 55.4012781 },
  { name: "ADCB", lines: ["Red"], lat: 25.2445099, lng: 55.2981834 },
  { name: "Airport Terminal 1", lines: ["Red"], lat: 25.2484769, lng: 55.3523558 },
  { name: "Airport Terminal 3", lines: ["Red"], lat: 25.245027, lng: 55.3594972 },
  { name: "Al Fardan Exchange", lines: ["Red"], lat: 25.0889162, lng: 55.1581735 },
  { name: "Al Furjan", lines: ["Red"], lat: 25.0304736, lng: 55.1522307 },
  { name: "Al Garhoud", lines: ["Red"], lat: 25.2494824, lng: 55.3399801 },
  { name: "Al Rigga", lines: ["Red"], lat: 25.2633466, lng: 55.3238862 },
  { name: "BurJuman", lines: ["Red", "Green"], lat: 25.2543976, lng: 55.30412 },
  { name: "Burj Khalifa / Dubai Mall", lines: ["Red"], lat: 25.2014367, lng: 55.2695451 },
  { name: "Business Bay", lines: ["Red"], lat: 25.1913122, lng: 55.2603981 },
  { name: "Centrepoint", lines: ["Red"], lat: 25.2303111, lng: 55.3911232 },
  { name: "DMCC", lines: ["Red"], lat: 25.0708766, lng: 55.1387113 },
  { name: "Danube", lines: ["Red"], lat: 25.0012905, lng: 55.0957087 },
  { name: "Deira City Centre", lines: ["Red"], lat: 25.2546811, lng: 55.3302605 },
  { name: "Discovery Gardens", lines: ["Red"], lat: 25.0352571, lng: 55.1454134 },
  { name: "Dubai Internet City", lines: ["Red"], lat: 25.1021654, lng: 55.1739012 },
  { name: "Dubai Investment Park", lines: ["Red"], lat: 25.0052466, lng: 55.1556654 },
  { name: "Emirates", lines: ["Red"], lat: 25.2410612, lng: 55.36568 },
  { name: "Emirates Towers", lines: ["Red"], lat: 25.217231, lng: 55.279881 },
  { name: "Energy", lines: ["Red"], lat: 25.0263116, lng: 55.1012953 },
  { name: "Equiti", lines: ["Red"], lat: 25.1266839, lng: 55.2079196 },
  { name: "Expo City Dubai", lines: ["Red"], lat: 24.9634934, lng: 55.1460846 },
  { name: "Financial Centre", lines: ["Red"], lat: 25.2108215, lng: 55.2755321 },
  { name: "Garmin", lines: ["Red"], lat: 25.15563, lng: 55.2285156 },
  { name: "Ibn Battuta", lines: ["Red"], lat: 25.0466788, lng: 55.1174939 },
  { name: "InsuranceMarket", lines: ["Red"], lat: 25.1147739, lng: 55.1908862 },
  { name: "Jumeirah Golf Estates", lines: ["Red"], lat: 25.0177925, lng: 55.1633352 },
  { name: "Life Pharmacy", lines: ["Red"], lat: 24.9775987, lng: 55.0910742 },
  { name: "Mall of the Emirates", lines: ["Red"], lat: 25.1212029, lng: 55.2004469 },
  { name: "Max", lines: ["Red"], lat: 25.2335944, lng: 55.2921844 },
  { name: "National Paints", lines: ["Red"], lat: 25.0578769, lng: 55.1273617 },
  { name: "Sobha Realty", lines: ["Red"], lat: 25.0799429, lng: 55.1475417 },
  { name: "The Gardens", lines: ["Red"], lat: 25.0435023, lng: 55.1350461 },
  { name: "Union", lines: ["Red", "Green"], lat: 25.2661816, lng: 55.3137508 },
  { name: "World Trade Centre", lines: ["Red"], lat: 25.2248353, lng: 55.2851186 },
];

/** Straight-line km under which a walk is worth suggesting. */
export const WALKABLE_KM = 1.5;

/**
 * The nearest station and an estimated walk: straight-line metres x 1.3
 * street detour / 80 m per minute, the same estimate as the venue facts
 * (not a routed walk, so the UI says "estimate"). Null without coordinates.
 */
export function nearestStation(latitude: number | null, longitude: number | null) {
  if (latitude == null || longitude == null) return null;
  let best: { station: MetroStation; km: number } | null = null;
  for (const station of METRO_STATIONS) {
    const km = distanceKm({ latitude, longitude }, { latitude: station.lat, longitude: station.lng });
    if (!best || km < best.km) best = { station, km };
  }
  if (!best) return null;
  const walkMin = Math.max(1, Math.round((best.km * 1000 * 1.3) / 80));
  return { ...best, walkable: best.km < WALKABLE_KM, walkMin };
}

type MetroSpot = {
  latitude: number | null;
  longitude: number | null;
  nearest_station?: string | null;
  station_walk_min?: number | null;
};

/** 1.5 km straight line is about 24 minutes at the estimate above. */
const WALKABLE_MIN = 24;

/**
 * The spot's nearest station and walk: 070's checked columns when present
 * (curated spots, trams included), else computed from the station list
 * (custom spots). Null when neither is known.
 */
export function metroFor(spot: MetroSpot): { name: string; walkMin: number | null; walkable: boolean } | null {
  if (spot.nearest_station) {
    const walkMin = spot.station_walk_min ?? null;
    return { name: spot.nearest_station, walkMin, walkable: walkMin != null && walkMin <= WALKABLE_MIN };
  }
  const near = nearestStation(spot.latitude, spot.longitude);
  return near ? { name: near.station.name, walkMin: near.walkMin, walkable: near.walkable } : null;
}

/** "Nearest metro: Business Bay, ≈ 8 min walk (estimate)", or the honest alternative. */
export function metroLine(spot: MetroSpot): string | null {
  const near = metroFor(spot);
  if (!near) return null;
  return near.walkable
    ? `Nearest metro: ${near.name}, ≈ ${near.walkMin} min walk (estimate)`
    : "No metro within walking distance, drive or taxi";
}
