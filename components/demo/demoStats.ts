// The /demo account's numbers, derived from its own fixtures so every figure
// on Been, Friends and Profile agrees with what those tabs list. Nothing here
// is a total the fixtures don't hold (house rule 1: no invented data).

export interface StatVisit {
  id: string;
  placeName: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  score: number;
  /** The part of the city it's in, for the area bars. */
  district: string;
  /** Friend ids who came. */
  with: readonly string[];
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthOf = (iso: string) => Number(iso.slice(5, 7)) - 1;

export function visitStats(visits: readonly StatVisit[]) {
  const latest = [...visits].sort((a, b) => b.date.localeCompare(a.date))[0];
  const year = latest ? latest.date.slice(0, 4) : null;
  const byDistrict = new Map<string, number>();
  visits.forEach((visit) => byDistrict.set(visit.district, (byDistrict.get(visit.district) ?? 0) + 1));
  const areas = [...byDistrict].map(([name, count]) => ({ name, count, share: Math.round((count / visits.length) * 100) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const months = [...new Set(visits.map((visit) => monthOf(visit.date)))].sort((a, b) => a - b);
  return {
    places: new Set(visits.map((visit) => visit.placeName)).size,
    year,
    inYear: year ? visits.filter((visit) => visit.date.startsWith(year)).length : 0,
    average: visits.length ? Math.round((visits.reduce((sum, visit) => sum + visit.score, 0) / visits.length) * 10) / 10 : null,
    areas,
    /** The lead line only when one area is ahead; a tie says so instead of crowning one. */
    topArea: areas.length > 1 && areas[0].count === areas[1].count ? null : areas[0] ?? null,
    /** "July", or "July to August" when the visits span months. */
    period: months.length === 0 ? null : months.length === 1 ? MONTHS[months[0]] : `${MONTHS[months[0]]} to ${MONTHS[months[months.length - 1]]}`,
  };
}

/** Outings with each friend and where they last went together, from the same visits. */
export function friendStats(visits: readonly StatVisit[], friendId: string) {
  const together = visits.filter((visit) => visit.with.includes(friendId)).sort((a, b) => b.date.localeCompare(a.date));
  return { outings: together.length, last: together[0]?.placeName ?? null };
}
