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
// or adding a friend. /home creates it on first view (lib/own-profile.ts) and
// AuthProfileBridge caches the result locally.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";

/**
 * Reads default to the browser client. Server Components pass their own
 * @supabase/ssr client so the same query runs during render, under the same
 * user's RLS, without a client-side round trip.
 */
type Db = SupabaseClient;
import type {
  CompanionView,
  PersonCard,
  ProfileVisit,
  Spot,
  SpotVisibility,
  Visit,
  WrappedSummaryResult,
} from "./types";
import { aggregateWrappedSummary, dubaiMonthWindow } from "./wrapped";
import type {
  WrappedMonthWindow,
  WrappedRatingRow,
  WrappedVisitRow,
} from "./wrapped";

export { aggregateWrappedSummary, dubaiMonthWindow } from "./wrapped";
export type {
  WrappedMonthWindow,
  WrappedRatingRow,
  WrappedVisitRow,
} from "./wrapped";

const PERSON_FIELDS = "id, display_name, emoji, color";

/** A chosen avatar emoji, or null. `ensure_authenticated_profile` stores "?"
 *  for "not chosen yet", which must never render as someone's avatar. */
export function chosenEmoji(emoji: string | null | undefined): string | null {
  return emoji && emoji !== "?" ? emoji : null;
}

const VISIT_SELECT = `
  id, person_id, spot_id, plan_id, visited_at, group_label, note, created_at,
  spot:spots(id,name,category,area,cuisine,price_band,min_spend,open_till,vibe,photo_url,photo_attribution,description,minimum_age,address,latitude,longitude),
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

// ─── Friend invites (migration 048) ────────────────────────────────
//
// A friendship grants each side the other's visit log, so it only exists
// when BOTH people act: one creates an invite, the other previews who sent
// it and then explicitly accepts. There is deliberately no direct write —
// `addFriend` used to insert any friend_id you liked, and is gone.
//
// Every refusal is its own result. "unavailable" (the call failed) must
// never read as "invalid" (the link is dead) or the user blames the link.

export type CreateInviteResult =
  | { result: "created"; token: string; expiresAt: string }
  | { result: "too_many" }
  | { result: "unavailable" };

export async function createFriendInvite(): Promise<CreateInviteResult> {
  const { data, error } = await getSupabase().rpc("create_friend_invite");
  if (error?.code === "54000") return { result: "too_many" };
  const row = data as { token?: unknown; expires_at?: unknown } | null;
  if (error || typeof row?.token !== "string" || typeof row.expires_at !== "string") {
    return { result: "unavailable" };
  }
  return { result: "created", token: row.token, expiresAt: row.expires_at };
}

export type InvitePreview =
  | { result: "valid"; displayName: string; emoji: string | null; sharedPlans: number | null }
  | { result: "self" | "invalid" | "unavailable" };

/** Who sent this invite. Reads only — never creates a friendship. */
export async function previewFriendInvite(token: string): Promise<InvitePreview> {
  const { data, error } = await getSupabase().rpc("preview_friend_invite", { p_token: token });
  const row = data as { result?: unknown; display_name?: unknown; emoji?: unknown; shared_plans?: unknown } | null;
  if (error || !row) return { result: "unavailable" };
  if (row.result === "valid" && typeof row.display_name === "string") {
    return {
      result: "valid",
      displayName: row.display_name,
      emoji: typeof row.emoji === "string" ? chosenEmoji(row.emoji) : null,
      // 054: how many plans the inviter and this viewer have BOTH joined. The
      // only thing on this screen an impersonator can't choose. Null when an
      // older server doesn't send it -- then no claim is made either way.
      sharedPlans: typeof row.shared_plans === "number" ? row.shared_plans : null,
    };
  }
  if (row.result === "self" || row.result === "invalid") return { result: row.result };
  return { result: "unavailable" };
}

export type RedeemResult = { result: "friends" | "already_friends" | "self" | "invalid" | "unavailable" };

/** Accept an invite. Only ever call this from an explicit user action. */
export async function redeemFriendInvite(token: string): Promise<RedeemResult> {
  const { data, error } = await getSupabase().rpc("redeem_friend_invite", { p_token: token });
  const result = (data as { result?: unknown } | null)?.result;
  if (error) return { result: "unavailable" };
  return result === "friends" || result === "already_friends" || result === "self" || result === "invalid"
    ? { result }
    : { result: "unavailable" };
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
  // the conflict path. `visits` had no UPDATE policy, so the conflicting
  // write was DENIED rather than merged. Migration 052 adds an owner-only
  // UPDATE policy for note/group_label/visited_at ONLY -- an upsert would
  // still fail, because person_id/spot_id/plan_id aren't updatable:
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
  //
  // Photos change the trade-off: deleting the old visit cascades its photo
  // ROWS but never the storage FILES, so re-rating a plan silently orphaned
  // private images -- and dropped photos the user had added. A plan visit
  // that already has photos is therefore kept as it is: re-rating still
  // saves the rating (rate_plan), the visit just isn't rebuilt.
  const existingWithPhotos = async (): Promise<string | null> => {
    if (!row.plan_id) return null;
    const { data: old } = await getSupabase()
      .from("visits")
      .select("id, photos:visit_photos(id)")
      .eq("person_id", row.person_id)
      .eq("plan_id", row.plan_id)
      .maybeSingle();
    const visit = old as unknown as { id: string; photos: { id: string }[] | null } | null;
    return visit && (visit.photos?.length ?? 0) > 0 ? visit.id : null;
  };
  const kept = await existingWithPhotos();
  if (kept) return kept;

  const clearPlanConflict = async () => {
    if (!row.plan_id) return;
    await getSupabase()
      .from("visits")
      .delete()
      .eq("person_id", row.person_id)
      .eq("plan_id", row.plan_id);
  };

  const insert = () =>
    getSupabase().from("visits").insert(row).select("id").maybeSingle();

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
    await getSupabase().from("visit_companions").insert(companions);
  }
  return visitId;
}

const PHOTO_BUCKET = "visit-photos";

/**
 * Remove photo files from storage, and prove they are gone. True only when
 * every path is confirmed absent.
 *
 * `storage.remove` reports what it removed. A path it doesn't report is
 * either already gone (a retry after a half-finished delete -- fine) or was
 * refused by the storage policy, which returns an empty result with NO
 * error. Only a listing tells those apart, so each unreported path is
 * looked up. Must run while the photo row still exists: reading a file is
 * gated on its visit_photos row.
 */
async function removePhotoFiles(paths: string[], db: Db): Promise<boolean> {
  if (paths.length === 0) return true;
  const { data, error } = await db.storage.from(PHOTO_BUCKET).remove(paths);
  if (error) return false;
  const reported = new Set((data ?? []).map((object) => object.name));
  for (const path of paths.filter((p) => !reported.has(p))) {
    const slash = path.lastIndexOf("/");
    const folder = path.slice(0, slash);
    const file = path.slice(slash + 1);
    const { data: listed, error: listError } = await db.storage.from(PHOTO_BUCKET).list(folder, { search: file });
    if (listError || (listed ?? []).some((entry) => entry.name === file)) return false;
  }
  return true;
}

/**
 * Delete one photo: the FILE first, then the row. If the file can't be
 * removed, stop and keep the row, so nothing is orphaned and a retry
 * converges (removing an already-removed file is fine). `.select()` on the
 * row delete because a refused delete touches 0 rows with no error.
 */
export async function deleteVisitPhoto(
  photo: { id: string; storage_path: string },
  db: Db = getSupabase(),
): Promise<boolean> {
  if (!(await removePhotoFiles([photo.storage_path], db))) return false;
  const { data, error } = await db.from("visit_photos").delete().eq("id", photo.id).select("id");
  return !error && (data?.length ?? 0) > 0;
}

/**
 * Edit your own visit: when it was, who it was with (the free-typed label) and
 * the note. 052 grants UPDATE on exactly these three columns — changing the
 * place or the plan is delete-and-relog, by design.
 *
 * `.select().single()` is load-bearing: an edit RLS refuses touches 0 rows and
 * returns NO error, so without it a refused save reads as saved. Returns the
 * stored row, which the server may have trimmed.
 */
export async function updateVisit(
  visitId: string,
  fields: { visited_at: string; group_label: string | null; note: string | null },
  db: Db = getSupabase(),
): Promise<Pick<Visit, "visited_at" | "group_label" | "note"> | null> {
  const { data, error } = await db
    .from("visits")
    .update(fields)
    .eq("id", visitId)
    .select("visited_at, group_label, note")
    .single();
  if (error) return null;
  return data as Pick<Visit, "visited_at" | "group_label" | "note">;
}

/**
 * Delete a visit and everything it owns. The visit delete cascades its photo
 * ROWS but never their storage FILES, so every file goes first; if any file
 * removal fails, stop and keep the visit and all its rows. Only then the
 * visit, with `.select()` so a refused delete isn't read as success.
 */
export async function deleteVisit(visitId: string, db: Db = getSupabase()): Promise<boolean> {
  const { data: photos, error: listError } = await db
    .from("visit_photos")
    .select("storage_path")
    .eq("visit_id", visitId);
  if (listError) return false;
  const paths = (photos ?? []).map((photo) => (photo as { storage_path: string }).storage_path);
  if (!(await removePhotoFiles(paths, db))) return false;
  const { data, error } = await db.from("visits").delete().eq("id", visitId).select("id");
  return !error && (data?.length ?? 0) > 0;
}

/**
 * Remove ONE companion tag. This is the untag path: the remedy for being
 * tagged into a visit you weren't on, and for fixing a mistyped name.
 *
 * Takes `visit_companions.id` — which is exactly what `CompanionView.id`
 * carries, so a UI can pass it straight through.
 *
 * Deletes only the tag, never the visit. The delete policy is owner-scoped
 * ("untag own visit companions"): only the person whose visit it is can
 * remove a tag. RLS hides other rows, so a refused untag deletes nothing and
 * still returns no error — callers must re-read rather than trust `true`.
 */
export async function untagCompanion(companionId: string): Promise<boolean> {
  if (!companionId) return false;
  // .select(): a refused or no-op delete returns no error; only a row back
  // proves the tag went (and that there's something for Undo to restore).
  const { data, error } = await getSupabase()
    .from("visit_companions")
    .delete()
    .eq("id", companionId)
    .select("id");
  return !error && (data?.length ?? 0) > 0;
}

/** Put a removed tag back (Undo). By profile when there is one, else by name. */
export async function retagCompanion(
  visitId: string,
  companion: { person: { id: string } | null; name: string },
): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("visit_companions")
    .insert(companion.person
      ? { visit_id: visitId, person_id: companion.person.id, companion_name: null }
      : { visit_id: visitId, person_id: null, companion_name: companion.name })
    .select("id");
  return !error && (data?.length ?? 0) > 0;
}

/**
 * The public profile feed: this person's visits, newest first, each with its
 * spot and resolved companions. Ordered by (visited_at desc, id desc) so the
 * sort is total and stable — visited_at alone ties constantly.
 */
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

export async function getProfileVisits(
  personId: string,
  limit = 50,
  db: Db = getSupabase(),
): Promise<ListRead<ProfileVisit>> {
  const { data, error } = await db
    .from("visits")
    .select(VISIT_SELECT)
    .eq("person_id", personId)
    .order("visited_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (error) return { rows: [], failed: true };
  return { rows: ((data ?? []) as unknown as RawVisit[]).map(toProfileVisit), failed: false };
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

// ─── Wrapped ──────────────────────────────────────────────────────

const WRAPPED_PAGE_SIZE = 500;
const WRAPPED_PLAN_CHUNK_SIZE = 100;

async function readWrappedVisits(
  personId: string,
  period: WrappedMonthWindow,
  db: Db,
): Promise<{ data: WrappedVisitRow[] | null; error: boolean }> {
  const rows: WrappedVisitRow[] = [];
  for (let from = 0; ; from += WRAPPED_PAGE_SIZE) {
    const result = await db
      .from("visits")
      .select("id, plan_id, spot_id, group_label, spot:spots(id, name, area, category)")
      .eq("person_id", personId)
      .gte("visited_at", period.start)
      .lt("visited_at", period.end)
      .order("visited_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + WRAPPED_PAGE_SIZE - 1);
    if (result.error) return { data: null, error: true };

    const page = (result.data ?? []) as unknown as WrappedVisitRow[];
    rows.push(...page);
    if (page.length < WRAPPED_PAGE_SIZE) return { data: rows, error: false };
  }
}

async function readWrappedRatings(
  planIds: string[],
  db: Db,
): Promise<{ data: WrappedRatingRow[] | null; error: boolean }> {
  const rows: WrappedRatingRow[] = [];
  for (let chunkStart = 0; chunkStart < planIds.length; chunkStart += WRAPPED_PLAN_CHUNK_SIZE) {
    const chunk = planIds.slice(chunkStart, chunkStart + WRAPPED_PLAN_CHUNK_SIZE);
    for (let from = 0; ; from += WRAPPED_PAGE_SIZE) {
      const result = await db
        .from("ratings")
        .select("id, plan_id, spot_id, stars")
        .in("plan_id", chunk)
        .order("id", { ascending: true })
        .range(from, from + WRAPPED_PAGE_SIZE - 1);
      if (result.error) return { data: null, error: true };

      const page = (result.data ?? []) as unknown as WrappedRatingRow[];
      rows.push(...page);
      if (page.length < WRAPPED_PAGE_SIZE) break;
    }
  }
  return { data: rows, error: false };
}

/**
 * Reads a complete monthly recap under the current user's RLS. `userId` is
 * the Supabase auth id (plan ownership); `personId` is the authenticated
 * profile id (visit ownership). A partial read never becomes a partial recap.
 */
export async function getWrappedSummary(
  userId: string,
  personId: string,
  db: Db,
  now = new Date(),
): Promise<WrappedSummaryResult> {
  const period = dubaiMonthWindow(now);
  const [plans, visits] = await Promise.all([
    // Via RPC (migration 050): 051 hides plans.created_by_user_id from
    // clients. Counts for auth.uid() -- the same user as `userId` here --
    // over the same [start, end) window the old query used.
    db.rpc("count_my_hosted_plans", { p_from: period.start, p_to: period.end }),
    readWrappedVisits(personId, period, db),
  ]);

  if (plans.error) return { data: null, error: "plans" };
  if (visits.error) return { data: null, error: "visits" };
  const visitRows = visits.data ?? [];
  const planIds = [...new Set(
    visitRows
      .map((visit) => visit.plan_id)
      .filter((id): id is string => id !== null),
  )];

  let ratingRows: WrappedRatingRow[] = [];
  if (planIds.length > 0) {
    const ratings = await readWrappedRatings(planIds, db);
    if (ratings.error) return { data: null, error: "ratings" };
    ratingRows = ratings.data ?? [];
  }

  return {
    data: aggregateWrappedSummary({
      periodLabel: period.periodLabel,
      planCount: Number(plans.data ?? 0),
      visits: visitRows,
      ratings: ratingRows,
    }),
    error: null,
  };
}

// ─── Visit collections + photos (SPECS.md §15.2) ────────────────────
//
// Both tables have full owner-scoped RLS ("manage own …" policies, `for
// all`), so writes go straight through PostgREST like visits/companions
// above — no RPC needed for either.

export interface VisitCollectionView {
  id: string;
  name: string;
  visitIds: string[];
}

interface RawCollection {
  id: string;
  name: string;
  items: { visit_id: string }[] | null;
}

/** A person's named visit folders, each with the visit ids it holds. */
export async function getVisitCollections(
  personId: string,
  db: Db = getSupabase(),
): Promise<ListRead<VisitCollectionView>> {
  const { data, error } = await db
    .from("visit_collections")
    .select("id, name, items:visit_collection_items(visit_id)")
    .eq("person_id", personId)
    .order("created_at");
  if (error) return { rows: [], failed: true };
  return { rows: ((data ?? []) as unknown as RawCollection[]).map((c) => ({
    id: c.id,
    name: c.name,
    visitIds: (c.items ?? []).map((i) => i.visit_id),
  })), failed: false };
}

/** Trimmed to the same 40-char limit as the DB check constraint. */
export async function createVisitCollection(
  personId: string,
  name: string,
  db: Db = getSupabase(),
): Promise<VisitCollectionView | null> {
  const trimmed = name.trim().slice(0, 40);
  if (!trimmed) return null;
  const { data, error } = await db
    .from("visit_collections")
    .insert({ person_id: personId, name: trimmed })
    .select("id, name")
    .maybeSingle();
  if (error || !data) return null;
  return { id: data.id as string, name: data.name as string, visitIds: [] };
}

export async function addVisitToCollection(
  collectionId: string,
  visitId: string,
  db: Db = getSupabase(),
): Promise<boolean> {
  const { error } = await db
    .from("visit_collection_items")
    .upsert({ collection_id: collectionId, visit_id: visitId });
  return !error;
}

export async function removeVisitFromCollection(
  collectionId: string,
  visitId: string,
  db: Db = getSupabase(),
): Promise<boolean> {
  const { data, error } = await db
    .from("visit_collection_items")
    .delete()
    .eq("collection_id", collectionId)
    .eq("visit_id", visitId)
    .select("visit_id");
  return !error && (data?.length ?? 0) > 0;
}

/** Delete a whole collection (its items cascade; the visits are untouched). */
export async function deleteVisitCollection(collectionId: string, db: Db = getSupabase()): Promise<boolean> {
  const { data, error } = await db.from("visit_collections").delete().eq("id", collectionId).select("id");
  return !error && (data?.length ?? 0) > 0;
}

export interface VisitPhotoView {
  id: string;
  visit_id: string;
  /** Needed to delete the file; the bucket is private, so it never renders. */
  storage_path: string;
  url: string | null;
  caption: string | null;
  visibility: SpotVisibility;
  created_at: string;
}

/**
 * This person's own visit photos with a short-lived signed URL for each —
 * the `visit-photos` bucket is private, so a bare storage_path never renders.
 * `url` is null when signing fails (RLS denied it, or the object is gone);
 * callers show the tile without an image rather than a broken one.
 */
export async function getVisitPhotos(
  personId: string,
  db: Db = getSupabase(),
): Promise<VisitPhotoView[]> {
  const { data, error } = await db
    .from("visit_photos")
    .select("id, visit_id, storage_path, caption, visibility, created_at")
    .eq("person_id", personId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  const rows = data as unknown as {
    id: string;
    visit_id: string;
    storage_path: string;
    caption: string | null;
    visibility: SpotVisibility;
    created_at: string;
  }[];
  if (rows.length === 0) return [];

  const { data: signed } = await db.storage
    .from("visit-photos")
    .createSignedUrls(rows.map((r) => r.storage_path), 3600);
  const urlByPath = new Map(
    (signed ?? []).map((s) => [s.path, s.error ? null : s.signedUrl]),
  );

  return rows.map((r) => ({
    id: r.id,
    visit_id: r.visit_id,
    storage_path: r.storage_path,
    url: urlByPath.get(r.storage_path) ?? null,
    caption: r.caption,
    visibility: r.visibility,
    created_at: r.created_at,
  }));
}

/**
 * Upload one photo for a visit: file goes to the private bucket under the
 * signed-in user's own folder (the only path `upload own visit photos`
 * grants), then the row that makes it visible per `visibility`. The row
 * insert is rolled back with a best-effort delete if it fails, so a photo
 * is never orphaned in storage with nothing pointing at it.
 */
export async function uploadVisitPhoto(
  {
    personId,
    visitId,
    file,
    caption,
    visibility,
  }: {
    personId: string;
    visitId: string;
    file: File;
    caption?: string;
    visibility: SpotVisibility;
  },
  db: Db = getSupabase(),
): Promise<boolean> {
  const { data: auth } = await db.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return false;

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${uid}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await db.storage
    .from("visit-photos")
    .upload(path, file, { contentType: file.type });
  if (uploadError) return false;

  const { error } = await db.from("visit_photos").insert({
    visit_id: visitId,
    person_id: personId,
    storage_path: path,
    caption: caption?.trim().slice(0, 160) || null,
    visibility,
  });
  if (error) {
    await db.storage.from("visit-photos").remove([path]);
    return false;
  }
  return true;
}
