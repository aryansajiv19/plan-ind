import { METRO_STATIONS, type MetroStation } from "./dubai-metro.ts";

// The Dubai Metro lines in running order (RTA's network), as station names
// from lib/dubai-metro.ts, so a map can draw each line through its stations.
// The Red Line's Route 2020 branch leaves the main line at National Paints.
const ORDER: Record<string, readonly string[]> = {
  red: [
    "Centrepoint", "Emirates", "Airport Terminal 3", "Airport Terminal 1", "Al Garhoud", "Deira City Centre",
    "Al Rigga", "Union", "BurJuman", "ADCB", "Max", "World Trade Centre", "Emirates Towers", "Financial Centre",
    "Burj Khalifa / Dubai Mall", "Business Bay", "Garmin", "Equiti", "Mall of the Emirates", "InsuranceMarket",
    "Dubai Internet City", "Al Fardan Exchange", "Sobha Realty", "DMCC", "National Paints", "Ibn Battuta",
    "Energy", "Danube", "Life Pharmacy",
  ],
  route2020: ["National Paints", "The Gardens", "Discovery Gardens", "Al Furjan", "Jumeirah Golf Estates", "Dubai Investment Park", "Expo City Dubai"],
  green: [
    "Creek", "Al Jadaf", "Dubai Healthcare City", "Oud Metha", "BurJuman", "Sharaf DG", "Al Ghubaiba", "Al Ras",
    "Gold Souq", "Baniyas Square", "Union", "Salah Al Din", "Abu Baker Al Siddique", "Abu Hail", "Al Qiyadah",
    "Stadium", "Al Nahda", "Dubai Airport Free Zone", "Al Qusais", "e&",
  ],
};

const BY_NAME = new Map(METRO_STATIONS.map((station) => [station.name, station]));

/** Each line as an ordered list of stations; a name missing from the data is skipped. */
export const METRO_LINES: { key: "red" | "route2020" | "green"; color: "Red" | "Green"; stations: MetroStation[] }[] = [
  { key: "red", color: "Red", stations: ORDER.red.map((name) => BY_NAME.get(name)).filter((s): s is MetroStation => Boolean(s)) },
  { key: "route2020", color: "Red", stations: ORDER.route2020.map((name) => BY_NAME.get(name)).filter((s): s is MetroStation => Boolean(s)) },
  { key: "green", color: "Green", stations: ORDER.green.map((name) => BY_NAME.get(name)).filter((s): s is MetroStation => Boolean(s)) },
];
