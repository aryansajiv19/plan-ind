import { DUBAI_ORIGINS } from "@/lib/dubai-areas";
import { DEAL_BUDGET_OPTIONS, DEAL_RADIUS_OPTIONS_KM } from "@/lib/spots/match";
import { minimumAgeForCategory } from "@/lib/age-policy";
import { CATEGORIES, CATEGORY_GROUPS, type GroupKey } from "@/components/categoryGroups";
import type { SmartIntent } from "@/components/SmartSearchBox";

/** P25: Luna's budget or radius, snapped to the nearest chip the form offers (ties go up). */
export function nearestOption(options: readonly (number | null)[], value: number | null): number | null {
  if (value == null) return null;
  const numbers = options.filter((option): option is number => option != null);
  return numbers.reduce((best, option) => (Math.abs(option - value) <= Math.abs(best - value) ? option : best), numbers[0]);
}

export interface IntentForm {
  /** Set only when the kind is listed and this account is old enough for it. */
  category: { key: string; group: GroupKey | null } | null;
  origin: string | null;
  maxBudget: number | null;
  radiusKm: number | null;
  /** Why the kind stayed as it was, or null. */
  message: string | null;
}

/** Luna's intent as the composer form should take it. A kind it can't use keeps `currentLabel`, and says so. */
export function intentToForm(intent: SmartIntent, age: number, currentLabel: string): IntentForm {
  const matched = CATEGORIES.find((item) => item.key === intent.category);
  const group = CATEGORY_GROUPS.find((g) => g.categories.some((item) => item.key === intent.category))?.key ?? null;
  const minimumAge = matched ? minimumAgeForCategory(matched.key) : 0;
  const usable = matched != null && age >= minimumAge;
  return {
    category: usable ? { key: matched.key, group } : null,
    origin: DUBAI_ORIGINS.find((origin) => origin.value === intent.origin)?.value ?? null,
    maxBudget: nearestOption(DEAL_BUDGET_OPTIONS, intent.maxBudget),
    radiusKm: intent.origin === "anywhere" ? null : nearestOption(DEAL_RADIUS_OPTIONS_KM, intent.radiusKm ?? 20),
    message: !matched ? `Luna suggested a kind of place the app doesn’t list, so this stays ${currentLabel}.`
      : !usable ? `${matched.label} is ${minimumAge}+, so this stays ${currentLabel}.`
        : null,
  };
}
