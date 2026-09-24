import { coordinatesForArea, distanceKm, type Coordinates } from "./dubai-areas.ts";

/**
 * "Why this?" — the one to three short reasons a dealt card was picked.
 *
 * Every reason is re-derived from what the vote screen already holds (the
 * plan's saved constraints, the spot row, this device's "been" list), not
 * returned by /api/spots/deal, so it can only ever say something the deal
 * itself filtered or ranked on. Pure; no I/O.
 */
export type DealReasonKind = "pinned" | "asked" | "budget" | "distance" | "new" | "late";

export interface DealReason {
  kind: DealReasonKind;
  label: string;
}

export interface DealReasonSpot {
  id: string;
  name: string;
  cuisine: string;
  vibe: string;
  description: string | null;
  min_spend: number;
  open_till: string;
  source?: string;
}

export interface DealReasonInput {
  spot: DealReasonSpot;
  /** AED per person the plan was dealt under. */
  maxBudget?: number | null;
  /** Only a reason when the plan set a radius: the deal filtered on it. */
  radiusKm?: number | null;
  distanceKm?: number | null;
  /** The smart-search vibe words the deal ranked on. */
  vibeKeywords?: readonly string[];
  /** Past winners on this device. Empty means no history, so "new" says nothing. */
  been?: readonly string[];
}

export const MAX_DEAL_REASONS = 3;
const KEYWORD_MAX = 24;

/** "1am" through "5am" (with or without minutes) counts as late. */
export function closesLate(openTill: string): boolean {
  const match = /^\s*(\d{1,2})(?::\d{2})?\s*am\s*$/i.exec(openTill);
  if (!match) return false;
  const hour = Number(match[1]);
  return hour >= 1 && hour <= 5;
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function askedKeyword(spot: DealReasonSpot, keywords: readonly string[]): string | null {
  const text = `${spot.name} ${spot.cuisine} ${spot.vibe} ${spot.description ?? ""}`.toLowerCase();
  for (const raw of keywords) {
    const keyword = raw.trim().toLowerCase();
    if (keyword.length < 2 || keyword.length > KEYWORD_MAX) continue;
    if (text.includes(keyword)) return keyword;
  }
  return null;
}

/** Ordered by how much the reason says about this card in particular. */
export function dealReasons(input: DealReasonInput): DealReason[] {
  const { spot } = input;
  // A place the host pinned skipped every filter below, so claiming it
  // "fits" anything would be invented.
  if (spot.source === "custom") return [{ kind: "pinned", label: "Pinned by the host" }];

  const reasons: DealReason[] = [];
  const keyword = askedKeyword(spot, input.vibeKeywords ?? []);
  if (keyword) reasons.push({ kind: "asked", label: `${capitalise(keyword)}, as asked` });

  if (input.maxBudget != null && spot.min_spend <= input.maxBudget) {
    reasons.push({ kind: "budget", label: `Fits AED ${input.maxBudget}` });
  }

  if (input.radiusKm != null && input.distanceKm != null && input.distanceKm <= input.radiusKm) {
    reasons.push({ kind: "distance", label: `${Math.max(1, Math.round(input.distanceKm))} km away` });
  }

  const been = input.been ?? [];
  if (been.length > 0 && !been.includes(spot.id)) reasons.push({ kind: "new", label: "New to you" });

  if (closesLate(spot.open_till)) reasons.push({ kind: "late", label: "Open late" });

  return reasons.slice(0, MAX_DEAL_REASONS);
}

/** Straight-line km from the plan's origin, by coordinates or area centre. */
export function spotDistanceKm(
  origin: Coordinates | null,
  spot: { area: string; latitude: number | null; longitude: number | null },
): number | null {
  if (!origin) return null;
  const destination = spot.latitude != null && spot.longitude != null
    ? { latitude: spot.latitude, longitude: spot.longitude }
    : coordinatesForArea(spot.area);
  return destination ? distanceKm(origin, destination) : null;
}
