import type { Spot } from "@/lib/types";
import { friendStats, visitStats } from "@/components/demo/demoStats";

// The demo account's sample life: four visits, five friends, three
// collections. Invented, and shown only under the demo's "Sample data"
// banner. Every number on Been, Friends and Profile is derived from these.
export const PLACES = [
  {
    name: "Ninive",
    area: "Emirates Towers",
    key: "dinner",
    district: "Downtown and DIFC",
    image: "/demo/alserkal-dinner.webp",
  },
  {
    name: "Drift Beach",
    area: "One&Only Royal Mirage",
    key: "beach_club",
    district: "Al Sufouh",
    image: "/demo/beach-club.webp",
  },
  {
    name: "Padel Art",
    area: "Al Quoz",
    key: "padel",
    district: "Al Quoz",
    image: "/demo/padel-night.webp",
  },
  {
    name: "Al Qudra Lakes",
    area: "Seih Al Salam",
    key: "outdoors",
    district: "Outside the city",
    image: "/demo/al-qudra-morning.webp",
  },
] as const;

export const VISITS = [
  { id: "ninive", place: PLACES[0], date: "2026-08-02", score: 4.8, with: ["sara", "maya", "zain"], note: "The garden table was the right call. Stayed for another round and nobody wanted to leave." },
  { id: "padel-art", place: PLACES[2], date: "2026-07-27", score: 4.6, with: ["omar", "zain"], note: "Booked ninety minutes, played for two hours. Tuesday evenings are quieter." },
  { id: "drift-beach", place: PLACES[1], date: "2026-07-19", score: 4.5, with: ["maya", "leila", "sara"], note: "Go early for the calm pool, stay through sunset, skip the loud late session." },
  { id: "al-qudra", place: PLACES[3], date: "2026-07-06", score: 4.9, with: ["omar", "leila", "zain"], note: "Left at 5:10, reached before sunrise. Coffee and bikes made the morning." },
] as const;

export interface DemoCollection {
  id: string;
  name: string;
  visitIds: string[];
}

export const DEFAULT_COLLECTIONS: DemoCollection[] = [
  { id: "late-dinners", name: "Late dinners", visitIds: ["ninive"] },
  { id: "active-dubai", name: "Sport and outdoors", visitIds: ["padel-art", "al-qudra"] },
  { id: "weekends", name: "Weekend reset", visitIds: ["drift-beach", "al-qudra"] },
];

export const FRIEND_ROWS = [
  { id: "sara", name: "Sara Ahmed", note: "Dinner · arts · low-key nights" },
  { id: "zain", name: "Zain Malik", note: "Padel · games · late food" },
  { id: "maya", name: "Maya Khan", note: "Beach clubs · brunch · wellness" },
  { id: "omar", name: "Omar Ali", note: "Outdoors · sports · coffee" },
  { id: "leila", name: "Leila Noor", note: "Cinema · live music · dessert" },
] as const;

// Every number on Been, Friends and Profile comes from the visits above.
const STAT_VISITS = VISITS.map((visit) => ({ id: visit.id, placeName: visit.place.name, date: visit.date, score: visit.score, district: visit.place.district, with: visit.with }));
export const STATS = visitStats(STAT_VISITS);
export const FRIENDS = FRIEND_ROWS.map((friend) => ({ ...friend, ...friendStats(STAT_VISITS, friend.id) }))
  .sort((a, b) => b.outings - a.outings);
// The sample visits are fixtures; match them to catalogue places by name so
// "Your Dubai" lights the right districts. An unmatched one falls back to its area.
export const demoVisitedSpots = (spots: Spot[]) =>
  VISITS.map((visit) => {
    const name = visit.place.name.toLowerCase();
    return spots.find((s) => s.name.toLowerCase().startsWith(name)) ?? { id: visit.id, area: visit.place.area };
  });
// The fixtures carry dates, not times: the hours the notes describe.
const DEMO_HOURS: Record<string, number> = { ninive: 21, "padel-art": 19, "drift-beach": 17, "al-qudra": 5 };
export const demoPersonalityVisits = (spots: Spot[]) =>
  demoVisitedSpots(spots).map((spot, i) => {
    const visit = VISITS[i];
    const catalogue = "category" in spot ? spot : null;
    return {
      visitedAt: new Date(`${visit.date}T${String(DEMO_HOURS[visit.id] ?? 20).padStart(2, "0")}:00:00+04:00`).toISOString(),
      spotId: spot.id,
      category: catalogue?.category ?? visit.place.key,
      cuisine: catalogue?.cuisine ?? null,
      area: spot.area,
      crewSize: visit.with.length + 1,
      fromPlan: true,
    };
  });
export const firstLetter = (id: string) => FRIEND_ROWS.find((friend) => friend.id === id)?.name.slice(0, 1) ?? "?";
export const dayLabel = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
