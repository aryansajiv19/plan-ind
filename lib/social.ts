// The social layer's data access: profiles, friends, visits, companions.
// Everything here runs in the browser with the current Supabase session
// (see lib/supabase.ts). Public reads remain available, while social writes
// are owner-scoped by RLS. There is no service-role key in this project and
// there must not be one.
//
// The contract the UI codes against lives in lib/types.ts:
//   PersonCard, CompanionView, ProfileVisit, Visit, Friendship.
// Call these functions rather than hand-writing select strings — the embed
// syntax and the FK disambiguation hints are fiddly and belong in one place.
//
// One setup rule: `visits.person_id` and `friendships.*` are foreign keys to
// `people`, so the authenticated profile must exist before logging a visit
// or adding a friend. AuthProfileBridge calls ensure_authenticated_profile()
// when the protected app boots and caches the returned profile locally.

import { supabase } from "./supabase";
import type { DeviceProfile } from "./device";
import type { CompanionView, PersonCard, ProfileVisit, Spot } from "./types";

const PERSON_FIELDS = "id, display_name, emoji, color";

const VISIT_SELECT = `
  id, person_id, spot_id, plan_id, visited_at, group_label, note, created_at,
  spot:spots(*),
  companions:visit_companions(id, person_id, companion_name, created_at,
    person:people(${PERSON_FIELDS}))
`;

interface RawCompanion {
  id: string;
  person_id: string | null;
  companion_name: string | null;
  created_at: string;
  person: PersonCard | null;
}

interface RawVisit {
  id: string;
  person_id: string;
  spot_id: string;
  plan_id: string | null;
  visited_at: string;
  group_label: string | null;
  note: string | null;
  created_at: string;
  spot: Spot | null;
  companions: RawCompanion[] | null;
}

// A companion row carries EITHER a person_id or a typed name (DB CHECK).
// Tagged profiles render from the live `people` row, so a rename propagates;
// typed names render as-is. Sorted here rather than server-side so the order
// is deterministic without depending on embedded-order syntax.
function toCompanionViews(rows: RawCompanion[] | null): CompanionView[] {
  return (rows ?? [])
    .map((c) => ({
      id: c.id,
      person: c.person ?? null,
      name: c.person?.display_name ?? c.companion_name ?? "Someone",
      created_at: c.created_at,
    }))
    .sort((a, b) =>
      a.created_at === b.created_at
        ? a.id.localeCompare(b.id)
        : a.created_at.localeCompare(b.created_at),
    )
    .map(({ id, person, name }) => ({ id, person, name }));
}

function toProfileVisit(v: RawVisit): ProfileVisit {
  return {
    id: v.id,
    person_id: v.person_id,
    spot_id: v.spot_id,
    plan_id: v.plan_id,
    visited_at: v.visited_at,
    group_label: v.group_label,
    note: v.note,
    created_at: v.created_at,
    spot: v.spot ?? null,
    companions: toCompanionViews(v.companions),
  };
}

// ─── Profiles ──────────────────────────────────────────────────────

/**
 * Push the cached authenticated profile up to `people`. Idempotent: RLS and
 * people_before_write pin the row to the current Supabase user.
 * Returns false if the write failed (the caller can retry on next boot).
 */
export async function upsertMe(me: DeviceProfile | null): Promise<boolean> {
  if (!me?.id || !me.display_name.trim()) return false;
  const { error } = await supabase.from("people").upsert(
    {
      id: me.id,
      display_name: me.display_name.trim(),
      emoji: me.emoji,
      color: me.color,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  return !error;
}

/** One profile by id. The id is the profile-link slug, like a plan's. */
export async function getPerson(personId: string): Promise<PersonCard | null> {
  const { data, error } = await supabase
    .from("people")
    .select(PERSON_FIELDS)
    .eq("id", personId)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as PersonCard;
}

/** Several profiles at once, e.g. to resolve a list of tagged ids. */
export async function getPeople(ids: string[]): Promise<PersonCard[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("people")
    .select(PERSON_FIELDS)
    .in("id", ids);
  if (error || !data) return [];
  return data as unknown as PersonCard[];
}

// ─── Friends ───────────────────────────────────────────────────────

/**
 * Someone's friends. Friendship is symmetric and stored as two directed
 * rows, so this is a single index scan on the friendships primary key —
 * no OR across two columns.
 */
export async function getFriends(personId: string): Promise<PersonCard[]> {
  const { data, error } = await supabase
    .from("friendships")
    .select(`friend:people!friendships_friend_id_fkey(${PERSON_FIELDS})`)
    .eq("person_id", personId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return (data as unknown as { friend: PersonCard | null }[])
    .map((r) => r.friend)
    .filter((p): p is PersonCard => p !== null);
}

/**
 * Become friends. Writes ONE row; a database trigger mirrors the reverse
 * edge, so never write both yourself. Idempotent.
 */
export async function addFriend(
  meId: string,
  friendId: string,
): Promise<boolean> {
  if (!meId || !friendId || meId === friendId) return false;
  const { error } = await supabase
    .from("friendships")
    .upsert(
      { person_id: meId, friend_id: friendId },
      { onConflict: "person_id,friend_id", ignoreDuplicates: true },
    );
  return !error;
}

/** Unfriend. Also symmetric: the trigger removes the reverse edge. */
export async function removeFriend(
  meId: string,
  friendId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("person_id", meId)
    .eq("friend_id", friendId);
  return !error;
}

/** Are these two already friends? Cheap check for the invite-link screen. */
export async function areFriends(
  meId: string,
  otherId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("friendships")
    .select("person_id")
    .eq("person_id", meId)
    .eq("friend_id", otherId)
    .maybeSingle();
  return !error && !!data;
}

// ─── Visits ────────────────────────────────────────────────────────

export interface CompanionInput {
  /** Set when the companion has a profile — renders live and links through. */
  person_id?: string | null;
  /** Set when they don't. This is the common case. */
  name?: string | null;
}

export interface LogVisitInput {
  person_id: string; // whose log this is — the device profile's id
  spot_id: string;
  /** Set to tie the visit back to the decided plan it came from. */
  plan_id?: string | null;
  /** Defaults to now. For a plan-derived visit, pass the plan's event_time. */
  visited_at?: string | null;
  /** "A group as well" — name the outing/crew, e.g. "Friday crew". */
  group_label?: string | null;
  note?: string | null;
  companions?: CompanionInput[];
}

// A person_id wins over a typed name, dupes are dropped (the DB uniques
// would otherwise reject the whole batch), and blank names are ignored.
//
// This is a convenience, not the enforcement point: a direct PostgREST call
// skips it entirely. Since migration 006 the database trims companion_name
// on write and has a case-insensitive unique index on
// (visit_id, lower(companion_name)), so "Sara" / "sara" / "Sara " collide
// server-side too. Display casing is preserved — only the key is folded.
function normaliseCompanions(
  input: CompanionInput[] | undefined,
  visitId: string,
  ownerId: string,
) {
  const seenIds = new Set<string>([ownerId]); // never tag yourself
  const seenNames = new Set<string>();
  const rows: {
    visit_id: string;
    person_id: string | null;
    companion_name: string | null;
  }[] = [];

  for (const c of input ?? []) {
    if (c.person_id) {
      if (seenIds.has(c.person_id)) continue;
      seenIds.add(c.person_id);
      rows.push({
        visit_id: visitId,
        person_id: c.person_id,
        companion_name: null,
      });
      continue;
    }
    const name = (c.name ?? "").trim().slice(0, 40);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seenNames.has(key)) continue;
    seenNames.add(key);
    rows.push({ visit_id: visitId, person_id: null, companion_name: name });
  }
  return rows;
}

/**
 * Log a visit, with or without a plan behind it.
 *
 * With `plan_id` set this is idempotent: `unique (person_id, plan_id)` means
 * re-logging the same plan replaces that visit rather than duplicating it,
 * and its companions go with it. Without a plan, every call is a new
 * standalone visit — which is what "I went somewhere yesterday" needs.
 *
 * ⚠ FOR CALLERS: a re-log REPLACES the row, so the returned visit id (and
 * its `created_at`) are NEW each time. Don't cache a visit id across a
 * re-log; re-read the feed.
 *
 * Returns the visit id, or null if the write failed.
 */
export async function logVisit(input: LogVisitInput): Promise<string | null> {
  const row = {
    person_id: input.person_id,
    spot_id: input.spot_id,
    plan_id: input.plan_id ?? null,
    visited_at: input.visited_at ?? new Date().toISOString(),
    group_label: input.group_label?.trim() || null,
    note: input.note?.trim() || null,
  };

  // Why this is delete-then-insert and NOT
  // `.upsert(row, { onConflict: "person_id,plan_id" })`:
  //
  // postgrest-js sends `Prefer: resolution=merge-duplicates`, which becomes
  // INSERT ... ON CONFLICT DO UPDATE. PostgreSQL applies UPDATE policies to
  // the conflict path, and `visits` deliberately has no UPDATE policy, so
  // the conflicting write was DENIED rather than merged:
  //   ERROR: new row violates row-level security policy (USING expression)
  //          for table "visits"
  // (reproduced on PostgreSQL 16 — see supabase/migration-006-social-
  // hardening.sql). The old code silently returned null and never reached
  // the companion replacement below, leaving a stale companion set.
  //
  // The alternative fix — granting `update on visits using (true)` — would
  // also let any holder of the public anon key silently rewrite the contents
  // of anyone's visit log. Deleting is already possible and is at least
  // visible; silent content forgery on durable personal history is not.
  //
  // The delete also recovers the squat case: `plans` is bulk-readable, so
  // anyone could pre-insert (your person_id, some plan_id) with junk. Under
  // the old upsert that blocked your real log forever, with no path out.
  // Here the delete clears it and your log lands.
  const clearPlanConflict = async () => {
    if (!row.plan_id) return;
    await supabase
      .from("visits")
      .delete()
      .eq("person_id", row.person_id)
      .eq("plan_id", row.plan_id);
  };

  const insert = () =>
    supabase.from("visits").insert(row).select("id").maybeSingle();

  await clearPlanConflict();
  let { data, error } = await insert();

  // Someone can insert between our delete and our insert (a second device,
  // or a squatter). Retry exactly once, so this can never spin.
  if (error?.code === "23505" && row.plan_id) {
    await clearPlanConflict();
    ({ data, error } = await insert());
  }
  if (error || !data) return null;
  const visitId = (data as unknown as { id: string }).id;

  // No companion cleanup needed: the row above is new, and any previous
  // visit's companions went with it via `on delete cascade`.
  //
  // Known v1 gap, flagged for `security`: the delete and the insert are two
  // PostgREST calls, not one transaction. If the insert fails after the
  // delete, the previous visit for that plan is gone. Making this atomic
  // needs an RPC or an edge function, which is a v2 decision.
  const companions = normaliseCompanions(
    input.companions,
    visitId,
    input.person_id,
  );
  if (companions.length > 0) {
    await supabase.from("visit_companions").insert(companions);
  }
  return visitId;
}

export async function deleteVisit(visitId: string): Promise<boolean> {
  const { error } = await supabase.from("visits").delete().eq("id", visitId);
  return !error;
}

/**
 * Remove ONE companion tag. This is the untag path: the remedy for being
 * tagged into a visit you weren't on, and for fixing a mistyped name.
 *
 * Takes `visit_companions.id` — which is exactly what `CompanionView.id`
 * carries, so a UI can pass it straight through.
 *
 * Deletes only the tag, never the visit. Note the "untag companions" policy
 * is row-unrestricted like every other delete in v1: anyone with the anon
 * key can untag anyone, not just themselves. That is the documented posture,
 * not something this function widens — until now there was simply no
 * implemented way to exercise it.
 */
export async function untagCompanion(companionId: string): Promise<boolean> {
  if (!companionId) return false;
  const { error } = await supabase
    .from("visit_companions")
    .delete()
    .eq("id", companionId);
  return !error;
}

/**
 * The public profile feed: this person's visits, newest first, each with its
 * spot and resolved companions. Ordered by (visited_at desc, id desc) so the
 * sort is total and stable — visited_at alone ties constantly.
 */
export async function getProfileVisits(
  personId: string,
  limit = 50,
): Promise<ProfileVisit[]> {
  const { data, error } = await supabase
    .from("visits")
    .select(VISIT_SELECT)
    .eq("person_id", personId)
    .order("visited_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as unknown as RawVisit[]).map(toProfileVisit);
}

/**
 * The other half of a profile: visits somebody else logged and tagged this
 * person into. Two hops, because the tag lives on visit_companions.
 */
export async function getTaggedVisits(
  personId: string,
  limit = 50,
): Promise<ProfileVisit[]> {
  const { data: tags, error } = await supabase
    .from("visit_companions")
    .select("visit_id")
    .eq("person_id", personId)
    .limit(limit);
  if (error || !tags || tags.length === 0) return [];
  const ids = (tags as unknown as { visit_id: string }[]).map((t) => t.visit_id);

  const { data, error: e2 } = await supabase
    .from("visits")
    .select(VISIT_SELECT)
    .in("id", ids)
    .order("visited_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (e2 || !data) return [];
  return (data as unknown as RawVisit[]).map(toProfileVisit);
}

export interface SpotVisitor {
  visit_id: string;
  visited_at: string;
  person: PersonCard | null;
}

/** "Who's been here" for a spot card. Newest first, deterministic. */
export async function getSpotVisitors(
  spotId: string,
  limit = 20,
): Promise<SpotVisitor[]> {
  const { data, error } = await supabase
    .from("visits")
    .select(`id, visited_at, person:people(${PERSON_FIELDS})`)
    .eq("spot_id", spotId)
    .order("visited_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (
    data as unknown as {
      id: string;
      visited_at: string;
      person: PersonCard | null;
    }[]
  ).map((r) => ({
    visit_id: r.id,
    visited_at: r.visited_at,
    person: r.person ?? null,
  }));
}
