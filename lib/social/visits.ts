// Writing the visit log: logging, editing and deleting visits, and tagging
// the companions on them. The read side is visit-feed.ts.

import type { Visit } from "../types";
import { getSupabase } from "../supabase";
import type { Db } from "./shared";
import { removePhotoFiles } from "./photos";

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
