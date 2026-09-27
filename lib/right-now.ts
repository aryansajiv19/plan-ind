import { openStatus } from "./open-hours.ts";
import { dubaiHour } from "./dubai-phase.ts";

// P28: the landing's "right now" wall, picked per request from the cached
// curated pool: open now in Dubai first, photographed first, and at most two
// of any one category, so it isn't the A-to-B slice of the catalogue.
type WallRow = { category: string; name: string; open_till?: string | null; photo_url?: string | null };

export function pickRightNow<T extends WallRow>(rows: readonly T[], now: Date, size: number): T[] {
  const rank = (row: T) => [
    openStatus(row.open_till, now)?.kind === "closed" ? 1 : 0,
    row.photo_url ? 0 : 1,
  ];
  const ordered = [...rows].sort((a, b) => {
    const [ra, rb] = [rank(a), rank(b)];
    return ra[0] - rb[0] || ra[1] - rb[1] || a.name.localeCompare(b.name);
  });
  const perCategory = new Map<string, number>();
  const picked: T[] = [];
  for (const row of ordered) {
    const seen = perCategory.get(row.category) ?? 0;
    if (seen >= 2) continue;
    perCategory.set(row.category, seen + 1);
    picked.push(row);
    if (picked.length === size) break;
  }
  return picked;
}

/** The greeting on the Dubai clock, computed on the server so there is no "Hello" first. */
export function greetingFor(now: Date): string {
  const hour = dubaiHour(now);
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
