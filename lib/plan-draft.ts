// A signed-out visitor's composer draft, carried across sign-in (P7):
// saved just before the sign-in link, restored once on /home, then cleared.
// sessionStorage, so it belongs to this tab and never outlives it.
const KEY = "deal-three:plan-draft";

export type PlanDraft = {
  category: string;
  maxBudget: number | null;
  origin: string;
  radiusKm: number | null;
  title: string;
  smartQuery: string;
};

export function saveDraft(draft: PlanDraft): void {
  try { sessionStorage.setItem(KEY, JSON.stringify(draft)); } catch { /* storage blocked: sign-in still works */ }
}

/** The saved draft, removed as it is read, or null. */
export function takeDraft(): PlanDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    const draft = raw ? JSON.parse(raw) as Partial<PlanDraft> : null;
    return draft && typeof draft.category === "string" && typeof draft.title === "string" && typeof draft.origin === "string"
      ? { category: draft.category, title: draft.title, origin: draft.origin, maxBudget: draft.maxBudget ?? null, radiusKm: draft.radiusKm ?? null, smartQuery: draft.smartQuery ?? "" }
      : null;
  } catch {
    return null;
  }
}
