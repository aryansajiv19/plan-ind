import { getBeen } from "./device";
import { secureJsonFetch } from "./security/csrf-client";
import type { DealConstraints } from "./spots/match";

export type { DealConstraints };

/** P26: what the reveal shows for a dealt place, once the route sends cards. */
export interface DealtCard {
  name: string;
  area: string;
  photo_url: string | null;
  photo_attribution: string | null;
}

/**
 * create_secure_plan puts place i in round (i mod 3) + 1, so the reveal,
 * which reads its nine round by round, gets them in that order.
 */
export function inRevealOrder<T>(spots: readonly T[]): T[] {
  return [0, 1, 2].flatMap((round) => [0, 1, 2].map((slot) => spots[slot * 3 + round])).filter((spot) => spot !== undefined);
}

function cardsFor(raw: unknown, ids: readonly string[]): DealtCard[] | null {
  if (!Array.isArray(raw) || raw.length !== ids.length) return null;
  const cards = raw.map((card, i) => {
    const row = card as Record<string, unknown> | null;
    if (!row || row.id !== ids[i] || typeof row.name !== "string" || typeof row.area !== "string") return null;
    const text = (value: unknown) => (typeof value === "string" && value ? value : null);
    return { name: row.name, area: row.area, photo_url: text(row.photo_url), photo_attribution: text(row.photo_attribution) };
  });
  return cards.every(Boolean) ? cards as DealtCard[] : null;
}

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
 * Cards come back when the route sends them (P26); without them the reveal
 * stays face down. Null means the catalogue genuinely has too few matches. A refused or failed
 * request returns the server's message instead: "raise your budget" is the
 * wrong advice when the real answer is "try again in a minute".
 */
export async function dealSpotsForCategory(
  category: string,
  count = 3,
  excludeIds: readonly string[] = [],
  constraints: DealConstraints = {},
): Promise<{ ids: string[]; cards: DealtCard[] | null } | null | { error: string }> {
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
  const payload = await response.json().catch(() => null) as { ids?: unknown; cards?: unknown; error?: unknown } | null;
  if (!response.ok) {
    return { error: typeof payload?.error === "string" ? payload.error : "Couldn't deal places right now. Try again in a moment." };
  }
  if (!Array.isArray(payload?.ids) || !payload.ids.every((id) => typeof id === "string")) return null;
  const ids = payload.ids as string[];
  return { ids, cards: cardsFor(payload.cards, ids) };
}
