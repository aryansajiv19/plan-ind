// Pure helpers for the gathering flow (group preferences): request parsing for
// the API routes and the row -> GroupPref fold the screens use. No I/O.
import { DUBAI_ORIGINS } from "./dubai-areas.ts";
import { GROUP_AVOID_OPTIONS, GROUP_BUDGET_OPTIONS, GROUP_VIBE_OPTIONS, originFor, type GroupPref } from "./group-prefs.ts";
import type { PlanGroupSummary, PlanPreferences } from "./types.ts";

export interface PrefsInput {
  budgetCap: number | null;
  origin: string | null; // a DUBAI_ORIGINS value; "anywhere" is stored as null
  vibes: string[];
  avoid: string[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string) => UUID.test(value);

/** At most two distinct words, every one on the closed list. Anything else is a refusal, not a trim. */
function words(value: unknown, allowed: readonly { value: string }[]): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 2 || new Set(value).size !== value.length) return null;
  const ok = new Set(allowed.map((o) => o.value));
  return value.every((v) => typeof v === "string" && ok.has(v)) ? (value as string[]) : null;
}

/** The three taps, validated against the closed vocabularies before the RPC sees them. */
export function parsePrefs(raw: unknown): PrefsInput | { error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "Send your answers." };
  const body = raw as Record<string, unknown>;
  const cap = body.budgetCap ?? null;
  // Ladder values only (100/200/350/any): a hand-built cap would skew the group's lowest.
  if (cap !== null && !(typeof cap === "number" && GROUP_BUDGET_OPTIONS.includes(cap))) return { error: "Pick a budget from the list." };
  const origin = body.origin ?? null;
  if (origin !== null && (typeof origin !== "string" || (origin !== "anywhere" && !originFor(origin)))) return { error: "Pick a starting area from the list." };
  const vibes = words(body.vibes, GROUP_VIBE_OPTIONS);
  const avoid = words(body.avoid, GROUP_AVOID_OPTIONS);
  if (!vibes || !avoid) return { error: "Pick up to two from each list." };
  return { budgetCap: cap as number | null, origin: origin === "anywhere" ? null : (origin as string | null), vibes, avoid };
}

/** The host's own settings for the skip path (the old composer controls). */
export interface HostSettings { budgetCap: number | null; radiusKm: number | null; origin: { latitude: number; longitude: number } | null }

export function parseHostSettings(raw: Record<string, unknown>): HostSettings | { error: string } {
  const { budgetCap = null, radiusKm = null, origin = null } = raw;
  if (budgetCap !== null && !(typeof budgetCap === "number" && Number.isInteger(budgetCap) && budgetCap >= 0 && budgetCap <= 10_000)) return { error: "That budget is not valid." };
  if (radiusKm !== null && !(typeof radiusKm === "number" && Number.isInteger(radiusKm) && radiusKm >= 1 && radiusKm <= 100)) return { error: "That distance is not valid." };
  if (origin !== null && typeof origin !== "string") return { error: "Pick a starting area from the list." };
  const point = typeof origin === "string" ? originFor(origin) : null;
  if (typeof origin === "string" && origin !== "anywhere" && !point) return { error: "Pick a starting area from the list." };
  return { budgetCap: budgetCap as number | null, radiusKm: point ? (radiusKm as number | null) : null, origin: point ? { latitude: point.latitude, longitude: point.longitude } : null };
}

export const toGroupPref = (row: PlanPreferences): GroupPref => ({
  name: row.voter_name,
  budgetCap: row.budget_cap,
  origin: row.origin_value && row.origin_latitude != null && row.origin_longitude != null
    ? { value: row.origin_value, latitude: row.origin_latitude, longitude: row.origin_longitude } : null,
  vibes: row.vibes,
  avoid: row.avoid,
});

/** "Widened to 30 km so there were enough places": one honest line, or null. */
export function relaxedNote(summary: { relaxed: ("budget" | "distance")[]; budgetCap: number | null; radiusKm: number | null }): string | null {
  const parts: string[] = [];
  if (summary.relaxed.includes("budget")) parts.push(summary.budgetCap != null ? `raised the budget to AED ${summary.budgetCap}` : "loosened the budget");
  if (summary.relaxed.includes("distance")) parts.push(summary.radiusKm != null ? `widened to ${summary.radiusKm} km` : "widened the distance");
  if (parts.length === 0) return null;
  const line = parts.join(" and ");
  return `${line[0].toUpperCase()}${line.slice(1)} so there were enough places`;
}

export const budgetLabel = (cap: number | null) => (cap == null ? "Any" : `Up to AED ${cap}`);
const originLabel = (value: string | null) => DUBAI_ORIGINS.find((o) => o.value === (value ?? "anywhere"))?.label ?? "Anywhere in Dubai";
const vibeLabel = (value: string) => GROUP_VIBE_OPTIONS.find((o) => o.value === value)?.label ?? value;
const avoidLabel = (value: string) => GROUP_AVOID_OPTIONS.find((o) => o.value === value)?.label ?? value;

/**
 * The dealt plan's header line, from group_summary, so the stored origin label
 * ("Fair point for the group", whatever the origin was) is never printed.
 * Two or more answers: the group's. Fewer: the host's own settings, with the
 * area name recovered from the saved coordinates when they are one of the list.
 */
export function constraintLine(summary: PlanGroupSummary): string {
  const budget = summary.budgetCap != null ? `up to AED ${summary.budgetCap} per person` : "any budget";
  if (summary.answered >= 2) {
    return `Chosen for the group: ${budget}${summary.radiusKm != null ? `, within ${summary.radiusKm} km of the group’s middle` : ""}`;
  }
  const c = summary.centroid;
  const area = c && DUBAI_ORIGINS.find((o) => o.coordinates && o.coordinates.latitude === c.latitude && o.coordinates.longitude === c.longitude)?.label;
  return `Set by the host: ${budget}${summary.radiusKm != null ? `, within ${summary.radiusKm} km of ${area ?? "their starting point"}` : ""}`;
}

/** What one person said, in one line. */
export function answerSummary(row: Pick<PlanPreferences, "budget_cap" | "origin_value" | "vibes" | "avoid">): string {
  if (row.budget_cap == null && !row.origin_value && !row.vibes.length && !row.avoid.length) return "No preferences, that’s fine";
  return [
    row.budget_cap == null ? "Any budget" : budgetLabel(row.budget_cap),
    row.origin_value ? `Coming from ${originLabel(row.origin_value)}` : "Coming from anywhere",
    ...(row.vibes.length ? [row.vibes.map(vibeLabel).join(" and ")] : []),
    ...(row.avoid.length ? [`No ${row.avoid.map((a) => avoidLabel(a).toLowerCase()).join(" or ")}`] : []),
  ].join(", ");
}

/**
 * Migration 100 not applied yet: PostgREST says PGRST202 (function) or PGRST205
 * (table), Postgres 42883 (function) or 42P01 (table). Routes answer a typed 503
 * and the composer falls back to the old deal, so the code can ship before the SQL.
 */
export const GROUP_PREFS_UNAVAILABLE = "group_prefs_unavailable";
export const isMissingGroupPrefs = (code: string | null | undefined): boolean =>
  code === "PGRST202" || code === "PGRST205" || code === "42883" || code === "42P01";
