// Fixtures for /demo/vote, the playable sample decision. Everything here is
// invented and only ever rendered under the "Sample data" banner (house rule
// 1: never show invented data as someone's own). No Supabase, no persistence.
//
// The spots are real Dubai venues in the curated catalog's shape; four match
// supabase/seed.sql so the sample and a fresh local database agree. Every one
// fits the sample budget: a card the real deal could never produce is a lie.
// The people are made up and render as initials only (lib/avatar.ts), never
// as photos or faces.
import type { Spot } from "@/lib/types";

export const SAMPLE_PLAN = {
  title: "Where are we eating Thursday?",
  // The composer's top budget (DEAL_BUDGET_OPTIONS), so the sample is a plan anyone can make.
  budgetPerPerson: 500,
  radiusKm: 25,
  originLabel: "DIFC",
  poolCount: 3,
} as const;

/** The visitor. "You" reads right on the seat row and in the card faces. */
export const SAMPLE_VOTER = "You";

export const SAMPLE_FRIENDS = ["Maya Haddad", "Omar Khalid", "Priya Nair", "Sam Carter"] as const;

type SpotSeed = Pick<Spot, "id" | "name" | "area" | "cuisine" | "price_band" | "min_spend" | "open_till" | "vibe" | "booking_url">
  // The catalogue's own photo, where it has one (same file and credit).
  & Partial<Pick<Spot, "photo_url" | "photo_attribution">>
  // The four real catalogue venues keep their real ids and Google place ids,
  // so the sample shows their real photos; the other five stay sample-only.
  & Partial<Pick<Spot, "google_place_id">>
  // P29: where the catalogue knows it (data/venue-facts.json), so the sample
  // winner's directions are real. Unknown stays null, never invented.
  & Partial<Pick<Spot, "address" | "latitude" | "longitude">>;

function dinner(seed: SpotSeed): Spot {
  return {
    ...seed,
    category: "dinner",
    minimum_age: 0,
    photo_url: seed.photo_url ?? null,
    photo_source: seed.photo_url ? "wikimedia" : null,
    photo_attribution: seed.photo_attribution ?? null,
    description: null,
    source: "curated",
    visibility: "community",
    address: seed.address ?? null,
    latitude: seed.latitude ?? null,
    longitude: seed.longitude ?? null,
  };
}

/** Nine spots, dealt three per round, in deal order. */
export const SAMPLE_POOLS: readonly (readonly Spot[])[] = [
  [
    dinner({ id: "a0000000-0000-0000-0000-000000000001", google_place_id: "ChIJN0PuVXJpXz4RTi-IEGAvito", name: "Reif Japanese Kushiyaki", area: "Dubai Hills", cuisine: "Japanese", price_band: "$$$", min_spend: 250, open_till: "12am", vibe: "Smoky skewers, tight room, always buzzing", booking_url: "https://www.reifother.com", address: "Dubai Hills Business Park, Building 3, Dubai", latitude: 25.1067369, longitude: 55.2401865 }),
    dinner({ id: "a0000000-0000-0000-0000-000000000002", google_place_id: "ChIJN81uvipDXz4RH_4cyTocRMI", name: "Ravi Restaurant", area: "Al Satwa", cuisine: "Pakistani", price_band: "$", min_spend: 45, open_till: "3am", vibe: "Legendary cheap eats, plastic chairs, no bookings", booking_url: null, address: "Shop 245, Al Dhiyafa Road, opposite Union Co-operative Society, Al Satwa, Dubai", latitude: 25.2336615, longitude: 55.2790297 }),
    dinner({ id: "a0000000-0000-0000-0000-000000000003", google_place_id: "ChIJc_qkbD5CXz4RjckbjFAB3eM", name: "3Fils", area: "Jumeirah", cuisine: "Seafood", price_band: "$$", min_spend: 180, open_till: "11pm", vibe: "Marina side, no reservations, quietly excellent", booking_url: null, address: "Shop 02, Jumeirah Fishing Harbour 1, Al Urouba Street, Jumeirah 1, Dubai", latitude: 25.2103004, longitude: 55.2433123 }),
  ],
  [
    dinner({ id: "a0000000-0000-0000-0000-000000000004", google_place_id: "ChIJlbbiwENqXz4RYs-mK1C-G8o", name: "Bu Qtair", photo_url: "/venues/a0000000-0000-0000-0000-000000000004.webp", photo_attribution: "Ankur P from Pune, India / Wikimedia Commons / CC BY 2.0", area: "Umm Suqeim", cuisine: "Seafood", price_band: "$", min_spend: 60, open_till: "11:30pm", vibe: "Fry shack by the beach, catch of the day", booking_url: null, address: "Old 32B Street, Fishing Harbour 2, Dubai", latitude: 25.1515093, longitude: 55.1971669 }),
    dinner({ id: "sample-orfali", name: "Orfali Bros Bistro", area: "Jumeirah", cuisine: "Middle Eastern", price_band: "$$", min_spend: 160, open_till: "11pm", vibe: "Three brothers, inventive small plates, worth the queue", booking_url: null }),
    dinner({ id: "sample-baitmaryam", name: "Bait Maryam", area: "JLT", cuisine: "Levantine", price_band: "$$", min_spend: 110, open_till: "11pm", vibe: "Home style Levantine, like dinner at an aunt's", booking_url: null }),
  ],
  [
    dinner({ id: "sample-alustad", name: "Al Ustad Special Kebab", area: "Bur Dubai", cuisine: "Persian", price_band: "$", min_spend: 0, open_till: "", vibe: "Family-run kebab house, walls of framed photos", booking_url: null }),
    dinner({ id: "sample-zuma", name: "Zuma", area: "DIFC", cuisine: "Japanese izakaya", price_band: "$$$", min_spend: 400, open_till: "1am", vibe: "Robata grill, loud room, see and be seen", booking_url: null }),
    dinner({ id: "sample-almallah", name: "Al Mallah", area: "Al Satwa", cuisine: "Lebanese", price_band: "$", min_spend: 40, open_till: "3am", vibe: "Shawarma institution, pavement tables, open late", booking_url: null }),
  ],
];

/**
 * How each friend votes, as an index into the round's three cards (for the
 * final, into the three finalists). Pinned rather than random so the sample
 * is the same for every visitor, and split so the visitor's own pick tips
 * most rounds: every round is 2/1/1 or 2/2 before they vote.
 */
export const FRIEND_PICKS: Record<"pool1" | "pool2" | "pool3" | "final", readonly number[]> = {
  pool1: [2, 0, 2, 1],
  pool2: [1, 2, 0, 1],
  pool3: [1, 2, 1, 0],
  final: [0, 1, 1, 0],
};

/** Which friend has already voted when a round opens, so it never looks empty. */
export const EARLY_FRIEND: Record<"pool1" | "pool2" | "pool3" | "final", number> = {
  pool1: 0,
  pool2: 1,
  pool3: 2,
  final: 3,
};

/** How long after a round opens each remaining friend's vote lands. */
export const ARRIVAL_DELAYS_MS = [1200, 2600, 4200] as const;
