// Anonymous, on-device memory of places you've already been dealt/decided.
// No account, no server column — it lives in this browser only. Used to bias
// new plans toward spots you haven't done yet ("haven't been yet").

const KEY = "plan-ind:been";

export function getBeen(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function addBeen(spotId: string | null): void {
  if (typeof window === "undefined" || !spotId) return;
  const set = new Set(getBeen());
  if (set.has(spotId)) return;
  set.add(spotId);
  localStorage.setItem(KEY, JSON.stringify([...set]));
}
