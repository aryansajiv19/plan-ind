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
 *
 * Null means the catalogue genuinely has too few matches. A refused or failed
 * request returns the server's message instead: "raise your budget" is the
 * wrong advice when the real answer is "try again in a minute".
 */
export async function dealSpotsForCategory(
  category: string,
  count = 3,
  excludeIds: readonly string[] = [],
  constraints: DealConstraints = {},
): Promise<string[] | null | { error: string }> {
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
  const payload = await response.json().catch(() => null) as { ids?: unknown; error?: unknown } | null;
  if (!response.ok) {
    return { error: typeof payload?.error === "string" ? payload.error : "Couldn't deal places right now. Try again in a moment." };
  }
  return Array.isArray(payload?.ids) && payload.ids.every((id) => typeof id === "string")
    ? payload.ids as string[]
    : null;
}
