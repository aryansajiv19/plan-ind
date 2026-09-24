import { getSupabase } from "../supabase";
import type { Db, ListRead } from "./shared";

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
