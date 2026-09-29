// The "this or that" step of ranking a place (085, Beli-style): binary
// insertion into one bucket of the person's list, best first. Each answer
// halves the window, so a bucket of n places takes at most ceil(log2(n + 1))
// taps. When the window closes, the neighbours are what rank_place takes:
// `after` = the place just above (judged better), `before` = just below.

export interface Ranked {
  spotId: string;
}

/** Where the new place can still land: indices lo..hi of the list (hi exclusive). */
export interface InsertionState {
  lo: number;
  hi: number;
}

export const startInsertion = (list: readonly Ranked[]): InsertionState => ({ lo: 0, hi: list.length });

/** The place to compare against next, or null when the slot is found. */
export function nextComparison<T extends Ranked>(list: readonly T[], state: InsertionState): T | null {
  return state.lo < state.hi ? list[Math.floor((state.lo + state.hi) / 2)] : null;
}

/** Record one answer: was the new place better than the one just shown? */
export function answerComparison(state: InsertionState, newIsBetter: boolean): InsertionState {
  const mid = Math.floor((state.lo + state.hi) / 2);
  return newIsBetter ? { lo: state.lo, hi: mid } : { lo: mid + 1, hi: state.hi };
}

/** rank_place's neighbours once the slot is found (null at either end). */
export function insertionNeighbours(list: readonly Ranked[], state: InsertionState): { after: string | null; before: string | null } {
  return { after: list[state.lo - 1]?.spotId ?? null, before: list[state.lo]?.spotId ?? null };
}

/** The whole search with a synchronous answer, e.g. to replay or test it. */
export function insertionFor<T extends Ranked>(list: readonly T[], newIsBetterThan: (other: T) => boolean) {
  let state = startInsertion(list);
  let steps = 0;
  for (let other = nextComparison(list, state); other; other = nextComparison(list, state)) {
    state = answerComparison(state, newIsBetterThan(other));
    steps += 1;
  }
  return { ...insertionNeighbours(list, state), steps };
}
