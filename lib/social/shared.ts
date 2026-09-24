// Pieces every lib/social/* module shares: the client type, the profile
// field list, and the list-read shape that keeps failure distinct from empty.

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Reads default to the browser client. Server Components pass their own
 * @supabase/ssr client so the same query runs during render, under the same
 * user's RLS, without a client-side round trip.
 */
export type Db = SupabaseClient;

export const PERSON_FIELDS = "id, display_name, emoji, color";

/** A chosen avatar emoji, or null. `ensure_authenticated_profile` stores "?"
 *  for "not chosen yet", which must never render as someone's avatar. */
export function chosenEmoji(emoji: string | null | undefined): string | null {
  return emoji && emoji !== "?" ? emoji : null;
}

/**
 * A list read that can tell "nothing there" from "could not read".
 *
 * Collapsing a failed read into `[]` is the trap this exists to close, and it
 * is not the same as forgetting to check the error — these functions all
 * checked it and then returned `[]` anyway, which reads as careful code. The
 * test for whether that matters is whether the empty value is a plausible
 * reading of the world. It is here: `[]` visits means "you have not been
 * anywhere", which is exactly what a new account looks like, so a returning
 * user whose read failed was told their history did not exist and invited to
 * start over. `getWrappedSummary` already draws this distinction — "a partial
 * read never becomes a partial recap" — and this is that pattern applied to
 * the reads behind Been and Friends rather than a new one invented.
 */
export interface ListRead<T> {
  rows: T[];
  /** True when the read FAILED. Never true merely because there is nothing. */
  failed: boolean;
}

export const emptyRead = <T,>(): ListRead<T> => ({ rows: [], failed: false });
