import { DUBAI_ORIGINS } from "@/lib/dubai-areas";
import { DEAL_BUDGET_OPTIONS, DEAL_RADIUS_OPTIONS_KM } from "@/lib/spots/match";
import { minimumAgeForCategory } from "@/lib/age-policy";
import { CATEGORIES, type Category } from "@/components/categoryGroups";

// P25: the last settings a plan was dealt with, per device. Every read is
// checked against what the form offers now; anything stale is ignored.
const SETTINGS_KEY = "deal-three:composer";
export type Remembered = { category?: string; maxBudget?: number | null; origin?: string; radiusKm?: number | null; presetIdx?: number };

export function readRemembered(): Remembered | null {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null");
    return raw && typeof raw === "object" ? raw as Remembered : null;
  } catch {
    return null;
  }
}

export function saveRemembered(settings: Remembered): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch { /* storage blocked: nothing remembered */ }
}

/** Only what the form still offers this account; a field is present only when its saved value is valid. */
export function validRemembered(saved: Remembered, age: number, presetCount: number): {
  category?: Category; maxBudget?: number | null; origin?: string; radiusKm?: number | null; presetIdx?: number;
} {
  const out: ReturnType<typeof validRemembered> = {};
  const known = CATEGORIES.find((c) => c.key === saved.category);
  if (known && age >= minimumAgeForCategory(known.key)) out.category = known;
  if (saved.maxBudget === null || DEAL_BUDGET_OPTIONS.includes(saved.maxBudget as number)) out.maxBudget = saved.maxBudget ?? null;
  if (DUBAI_ORIGINS.some((origin) => origin.value === saved.origin)) out.origin = saved.origin;
  if (saved.radiusKm === null || DEAL_RADIUS_OPTIONS_KM.includes(saved.radiusKm as number)) out.radiusKm = saved.radiusKm ?? null;
  if (Number.isInteger(saved.presetIdx) && saved.presetIdx! >= 0 && saved.presetIdx! < presetCount) out.presetIdx = saved.presetIdx;
  return out;
}
