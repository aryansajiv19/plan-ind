// Profiles and friends: who someone is, and who they go out with.

import type { PersonCard } from "../types";
import { getSupabase } from "../supabase";
import { PERSON_FIELDS, type Db, type ListRead } from "./shared";

// ─── Profiles ──────────────────────────────────────────────────────

/** One profile by id. The id is the profile-link slug, like a plan's. */
export async function getPerson(personId: string): Promise<PersonCard | null> {
  const { data, error } = await getSupabase()
    .from("people")
    .select(PERSON_FIELDS)
    .eq("id", personId)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as PersonCard;
}

// ─── Friends ───────────────────────────────────────────────────────

/**
 * Someone's friends. Friendship is symmetric and stored as two directed
 * rows, so this is a single index scan on the friendships primary key —
 * no OR across two columns. A failed read says so: `[]` friends is exactly
 * what a new account looks like, so it must never stand in for a refusal.
 */
export async function getFriends(personId: string, db: Db = getSupabase()): Promise<ListRead<PersonCard>> {
  const { data, error } = await db
    .from("friendships")
    .select(`friend:people!friendships_friend_id_fkey(${PERSON_FIELDS})`)
    .eq("person_id", personId)
    .order("created_at", { ascending: true });
  if (error) return { rows: [], failed: true };
  return {
    rows: ((data ?? []) as unknown as { friend: PersonCard | null }[])
      .map((r) => r.friend)
      .filter((p): p is PersonCard => p !== null),
    failed: false,
  };
}

/** Unfriend. Symmetric: the trigger removes the reverse edge. */
export async function removeFriend(
  meId: string,
  friendId: string,
): Promise<boolean> {
  // .select(): a delete RLS refuses, or that matches nothing, returns no
  // error -- only the rows that came back prove the friendship went.
  const { data, error } = await getSupabase()
    .from("friendships")
    .delete()
    .eq("person_id", meId)
    .eq("friend_id", friendId)
    .select("friend_id");
  return !error && (data?.length ?? 0) > 0;
}

export interface PlannedWith {
  /** Display name. A companion may be a typed name with no account at all. */
  name: string;
  /** Their profile, when they have one. */
  person: PersonCard | null;
  /** How many of your visits they were on. */
  shared: number;
}

/**
 * People you have actually been out with, derived from the companions on your
 * own visits.
 *
 * This exists because `getFriends()` reads `friendships`, and **nothing in the
 * app ever writes that table** — so the Friends tab was empty by construction
 * and stayed empty forever. Companions, by contrast, are written by
 * `logVisit()` from the coming RSVPs every time someone rates a decided plan,
 * so this fills up after a single completed outing.
 *
 * Typed names and real profiles are both included: most people on a shared
 * plan link have no account, and leaving them out would hide the majority of
 * who you actually went with.
 */
export async function getPlannedWith(
  personId: string,
  db: Db = getSupabase(),
): Promise<ListRead<PlannedWith>> {
  const { data, error } = await db
    .from("visit_companions")
    .select(`companion_name, person:people(${PERSON_FIELDS}), visit:visits!inner(person_id)`)
    .eq("visit.person_id", personId);
  if (error) return { rows: [], failed: true };
  if (!data) return { rows: [], failed: false };

  const tally = new Map<string, PlannedWith>();
  for (const row of data as unknown as {
    companion_name: string | null;
    person: PersonCard | null;
  }[]) {
    const name = row.person?.display_name ?? row.companion_name;
    if (!name) continue;
    // Fold by display name so the same person tagged sometimes by profile and
    // sometimes by typed name counts once.
    const key = name.toLowerCase();
    const seen = tally.get(key);
    if (seen) {
      seen.shared += 1;
      seen.person = seen.person ?? row.person ?? null;
    } else {
      tally.set(key, { name, person: row.person ?? null, shared: 1 });
    }
  }
  // Most-shared first; accounts win ties so real profiles surface.
  return { rows: [...tally.values()].sort(
    (a, b) => b.shared - a.shared
      || Number(Boolean(b.person)) - Number(Boolean(a.person))
      || a.name.localeCompare(b.name),
  ), failed: false };
}
