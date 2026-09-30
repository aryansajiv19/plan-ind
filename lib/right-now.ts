import { openStatus } from "./open-hours.ts";
import { dubaiHour } from "./dubai-phase.ts";

// P28: the landing's "right now" wall, picked per request from the cached
// curated pool: open now in Dubai first, photographed first, and at most two
// of any one category, so it isn't the A-to-B slice of the catalogue.
type WallRow = { category: string; name: string; open_till?: string | null; photo_url?: string | null; google_place_id?: string | null };

export function pickRightNow<T extends WallRow>(rows: readonly T[], now: Date, size: number): T[] {
  // Our own photo first: the signed-out wall shows no Google photos (they
  // are billed per view), so a Google-only pick would be a photo-less card.
  // Then open now, then Google-matched before none.
  const rank = (row: T) => [
    row.photo_url ? 0 : 1,
    openStatus(row.open_till, now)?.kind === "closed" ? 1 : 0,
    row.google_place_id ? 0 : 1,
  ];
  const ordered = [...rows].sort((a, b) => {
    const [ra, rb] = [rank(a), rank(b)];
    return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2] || a.name.localeCompare(b.name);
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

