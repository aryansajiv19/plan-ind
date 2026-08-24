import { getBeen } from "./device";
import { secureJsonFetch } from "./security/csrf-client";
import type { DealConstraints } from "./spots/match";

export type { DealConstraints };

/**
 * Ask the server to deal curated spot ids. The ranking itself lives in
 * `lib/spots/match.ts` and runs behind `/api/spots/deal`, so the candidate
 * pool and its ratings never reach the browser — and so a query embedding
 * (server-only key) can join the draw later.
 *
 * `been` is localStorage, which the server cannot read, so it still rides
 * along in the body. Constraints are re-validated server-side and `age` is
 * ignored there in favour of the account's own.
 */
export async function dealSpotsForCategory(
  category: string,
  count = 3,
  excludeIds: readonly string[] = [],
  constraints: DealConstraints = {},
): Promise<string[] | null> {
  const response = await secureJsonFetch("/api/spots/deal", {
    method: "POST",
    body: JSON.stringify({
      category,
      count,
      excludeIds,
      been: getBeen().slice(-200),
      constraints,
    }),
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null) as { ids?: unknown } | null;
  return Array.isArray(payload?.ids) && payload.ids.every((id) => typeof id === "string")
    ? payload.ids as string[]
    : null;
}

export function dealThreeForCategory(category: string): Promise<string[] | null> {
  return dealSpotsForCategory(category, 3);
}
