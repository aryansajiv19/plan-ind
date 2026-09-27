import { CATEGORIES } from "../components/categoryGroups.ts";
import { minimumAgeForCategory } from "./age-policy.ts";
import { DUBAI_ORIGINS } from "./dubai-areas.ts";
import { DEAL_BUDGET_OPTIONS, DEAL_RADIUS_OPTIONS_KM } from "./spots/match.ts";
import type { PlanPrefill } from "./board-plan.ts";

const offered = (options: readonly (number | null)[], value: number | null | undefined) =>
  value === null || (typeof value === "number" && options.includes(value));

/**
 * A prefill (a draft restored after sign-in, a board, a place, a friend)
 * checked against what the composer offers this account, the same checks
 * remembered settings get. A field it wouldn't offer is dropped, and the
 * form's own default stands: a sessionStorage draft is the browser's to edit.
 */
export function checkedPrefill(prefill: PlanPrefill | null, age: number): PlanPrefill | null {
  if (!prefill) return null;
  const category = CATEGORIES.some((c) => c.key === prefill.category) && age >= minimumAgeForCategory(prefill.category!)
    ? prefill.category : null;
  return {
    ...prefill,
    category,
    origin: DUBAI_ORIGINS.some((origin) => origin.value === prefill.origin) ? prefill.origin : "anywhere",
    maxBudget: offered(DEAL_BUDGET_OPTIONS, prefill.maxBudget) ? prefill.maxBudget : undefined,
    radiusKm: offered(DEAL_RADIUS_OPTIONS_KM, prefill.radiusKm) ? prefill.radiusKm : undefined,
    title: typeof prefill.title === "string" ? prefill.title.slice(0, 60) : "",
    smartQuery: typeof prefill.smartQuery === "string" ? prefill.smartQuery.slice(0, 600) : undefined,
  };
}
