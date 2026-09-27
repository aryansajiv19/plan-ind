import { DUBAI_ORIGINS, coordinatesForArea, distanceKm } from "./dubai-areas";

// "Plan from this board". StartPlanForm can only pin the caller's own custom
// places (my_custom_spots), not curated catalogue spots by id, so a board
// cannot hand its places to the deal directly. What it can do honestly is
// set the form up the way the board leans: the category most of its places
// share, the starting area most of them sit near, and the board's name as
// the question. The deal then draws from the catalogue as usual.

export interface PlanPrefill {
  /** Remounts the form, so a second board replaces the first one's setup. */
  key: string;
  boardName: string;
  /** Null when the board has no places, or none the viewer may plan. */
  category: string | null;
  /** A DUBAI_ORIGINS value; "anywhere" when the places don't cluster. */
  origin: string;
  title: string;
  /** What set the form up, for the note it shows. Absent means a board, or a restored draft. */
  source?: "place" | "like" | "friend";
  /** P30: a catalogue place the vote starts with, dealt into round 1. */
  pinned?: { id: string; name: string; area: string; photo_url: string | null; photo_attribution: string | null; from?: "shelf" };
  /** A signed-out draft restored after sign-in (P7) also carries these. */
  maxBudget?: number | null;
  radiusKm?: number | null;
  smartQuery?: string;
}

/** A place counts toward an origin only when it sits this close to it. */
const ORIGIN_RADIUS_KM = 6;

/** The most frequent value and its count; ties go to the one seen first. */
function mode(values: string[]): { value: string; count: number } | null {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: { value: string; count: number } | null = null;
  for (const [value, count] of counts) if (!best || count > best.count) best = { value, count };
  return best;
}

/** The named starting point nearest an area, if one is within reach. */
export function originForArea(area: string): string | null {
  const at = coordinatesForArea(area);
  if (!at) return null;
  let best: { value: string; km: number } | null = null;
  for (const origin of DUBAI_ORIGINS) {
    if (!origin.coordinates) continue;
    const km = distanceKm(at, origin.coordinates);
    if (km <= ORIGIN_RADIUS_KM && (!best || km < best.km)) best = { value: origin.value, km };
  }
  return best?.value ?? null;
}

export function boardPlanPrefill(
  board: { id: string; name: string },
  places: { category: string; area: string }[],
  /** Categories the composer offers AND this viewer is old enough for. */
  allowedCategory: (category: string) => boolean,
  key: string,
): PlanPrefill {
  const near = mode(places.map((place) => originForArea(place.area)).filter((v): v is string => v !== null));
  return {
    key,
    boardName: board.name,
    category: mode(places.map((place) => place.category).filter(allowedCategory))?.value ?? null,
    // Only when most of the board sits there: one Marina place on a board
    // of five elsewhere must not narrow the whole deal to the Marina.
    origin: near && near.count * 2 > places.length ? near.value : "anywhere",
    title: board.name.trim().slice(0, 60),
  };
}

/**
 * "Start a vote with this place" (P30): the place itself goes into round 1,
 * and the form is set to its type and nearest starting area so the other
 * eight are dealt around it. A place the viewer may not plan sets no type.
 */
export function placePlanPrefill(
  spot: { id: string; name: string; area: string; category: string; photo_url: string | null; photo_attribution: string | null },
  allowedCategory: (category: string) => boolean,
  key: string,
): PlanPrefill {
  return {
    key,
    boardName: spot.name,
    category: allowedCategory(spot.category) ? spot.category : null,
    origin: originForArea(spot.area) ?? "anywhere",
    title: `${spot.name}, or somewhere better?`.slice(0, 60),
    source: "place",
    pinned: { id: spot.id, name: spot.name, area: spot.area, photo_url: spot.photo_url, photo_attribution: spot.photo_attribution },
  };
}

/** "Plan together" (P30): the composer asks the question with them in it; the share link does the inviting. */
export function friendPlanPrefill(name: string, key: string): PlanPrefill {
  const first = name.trim().split(/\s+/)[0] || name;
  return { key, boardName: name, category: null, origin: "anywhere", title: `${first}, where to?`.slice(0, 60), source: "friend" };
}
