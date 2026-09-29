// "Your Dubai": how much of the city a person has actually been out in, by
// district, and how many of the Dubai icons they have ticked off. Derived
// from visits and the curated catalogue only; nothing is stored.
//
// A spot's `area` is whatever the venue calls home ("Atlantis", "Emirates
// Towers"), so districts group those into the parts of Dubai people
// actually talk about. An area missing here counts toward no district.

export interface District {
  name: string;
  areas: readonly string[];
}

export const DISTRICTS: readonly District[] = [
  { name: "Marina & JBR", areas: ["Dubai Marina", "JBR", "La Vie, JBR", "JLT", "Dubai Harbour", "Le Royal Meridien"] },
  { name: "The Palm", areas: ["Palm Jumeirah", "Atlantis", "One&Only Royal Mirage"] },
  { name: "Downtown & DIFC", areas: ["Downtown Dubai", "Dubai Mall", "Address Dubai Mall", "Address Sky View", "Emirates Towers", "DIFC", "Trade Centre", "Dubai World Trade Centre"] },
  { name: "Business Bay", areas: ["Business Bay", "JW Marriott Marquis", "The Oberoi", "Al Habtoor City"] },
  { name: "Jumeirah coast", areas: ["Jumeirah", "Jumeirah Beach", "Umm Suqeim", "Madinat Jumeirah", "Pearl Jumeirah"] },
  { name: "City Walk & Satwa", areas: ["City Walk", "Al Wasl", "Al Satwa"] },
  { name: "Al Quoz & Alserkal", areas: ["Al Quoz", "Al Serkal Avenue", "Alserkal Avenue"] },
  { name: "Creek & Old Dubai", areas: ["Dubai Creek", "Al Shindagha", "Bur Dubai", "Al Karama", "Oud Metha", "Jaddaf Waterfront", "Design District", "Dubai Design District"] },
  { name: "Deira & Al Rigga", areas: ["Deira", "Al Rigga", "Al Ras", "Port Saeed"] },
  { name: "Festival City & Garhoud", areas: ["Dubai Festival City", "Al Garhoud"] },
  { name: "Al Nahda & Qusais", areas: ["Al Nahda", "Al Qusais", "Al Twar"] },
  { name: "Mirdif & Al Warqa", areas: ["Mirdif", "Al Warqa", "Mushrif Park", "Al Khawaneej"] },
  { name: "Silicon Oasis & Academic City", areas: ["Dubai Silicon Oasis", "Academic City"] },
  { name: "Barsha & Dubai Hills", areas: ["Al Barsha", "Mall of the Emirates", "Grand Millennium", "Dubai Hills", "The Lakes"] },
  { name: "JVC, Sports City & Motor City", areas: ["JVC", "JVT", "Dubai Sports City", "Motor City"] },
  { name: "Meydan & Nad Al Sheba", areas: ["Meydan", "Nad Al Sheba"] },
  { name: "Desert & beyond", areas: ["Dubai Desert", "Hatta", "Seih Al Salam"] },
];

const DISTRICT_OF = new Map(
  DISTRICTS.flatMap((d) => d.areas.map((area) => [area.toLowerCase(), d.name] as const)),
);

export function districtFor(area: string | null | undefined): string | null {
  return area ? DISTRICT_OF.get(area.trim().toLowerCase()) ?? null : null;
}

/** The Dubai icons: curated places every Dubai list should have. Ids from the catalogue. */
export const ICONS: readonly { spotId: string; label: string }[] = [
  { spotId: "87000000-0000-0000-0000-000000000003", label: "Museum of the Future" },
  { spotId: "86000000-0000-0000-0000-000000000003", label: "Edge Walk at Sky Views" },
  { spotId: "87000000-0000-0000-0000-000000000002", label: "Old Dubai at Al Shindagha" },
  { spotId: "8b000000-0000-0000-0000-000000000001", label: "Dunes at Bab Al Shams" },
  { spotId: "50000000-0000-0000-0000-000000000002", label: "Kayak in Hatta" },
  { spotId: "86000000-0000-0000-0000-000000000001", label: "Deep Dive Dubai" },
  { spotId: "84000000-0000-0000-0000-000000000001", label: "Aquaventure" },
  { spotId: "40000000-0000-0000-0000-000000000001", label: "Kite Beach" },
  { spotId: "50000000-0000-0000-0000-000000000003", label: "Marina Walk" },
  { spotId: "50000000-0000-0000-0000-000000000001", label: "Sunrise at Al Qudra" },
  { spotId: "a0000000-0000-0000-0000-000000000002", label: "Karak at Ravi" },
  { spotId: "a0000000-0000-0000-0000-000000000004", label: "Fish at Bu Qtair" },
];

interface PlaceLike {
  id: string;
  area: string;
}

export interface DistrictProgress extends District {
  been: number; // distinct places visited here
  total: number; // curated places here
}

export interface DubaiExplored {
  districts: DistrictProgress[];
  /** Districts with at least one visit. */
  districtsBeen: number;
  percent: number; // 0-100, districts visited
  icons: { spotId: string; label: string; done: boolean }[];
  iconsDone: number;
  /** The next nudge: the unvisited district with the most places to try. */
  next: DistrictProgress | null;
}

export function dubaiExplored(visitedSpots: readonly (PlaceLike | null)[], catalogue: readonly PlaceLike[]): DubaiExplored {
  const visitedIds = new Set(visitedSpots.flatMap((s) => (s ? [s.id] : [])));
  const places = new Map(catalogue.map((s) => [s.id, s]));
  for (const s of visitedSpots) if (s && !places.has(s.id)) places.set(s.id, s);

  const districts = DISTRICTS.map((d) => {
    let been = 0;
    let total = 0;
    for (const place of places.values()) {
      if (districtFor(place.area) !== d.name) continue;
      total += 1;
      if (visitedIds.has(place.id)) been += 1;
    }
    return { ...d, been, total };
  });
  const districtsBeen = districts.filter((d) => d.been > 0).length;
  const icons = ICONS.map((icon) => ({ ...icon, done: visitedIds.has(icon.spotId) }));
  const next = districts.filter((d) => d.been === 0 && d.total > 0).sort((a, b) => b.total - a.total)[0] ?? null;

  return {
    districts,
    districtsBeen,
    percent: Math.round((districtsBeen / DISTRICTS.length) * 100),
    icons,
    iconsDone: icons.filter((i) => i.done).length,
    next,
  };
}
