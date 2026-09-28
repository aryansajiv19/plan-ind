import { getSupabase } from "../supabase";
import type { Db, ListRead } from "./shared";

// ─── Folders (081) ──────────────────────────────────────────────────
//
// Private folders grouping the account's three kinds of list. Owner-scoped
// RLS ("manage own folders", `for all`) like the lists themselves, so writes
// go straight through PostgREST. The database refuses filing a list in
// someone else's folder (composite FK), and deleting a folder un-files its
// lists. Every write checks it touched a row: RLS turns "not yours" into
// zero rows, not an error.

export type ListKind = "been" | "board" | "saved";
export interface FolderView { id: string; name: string; emoji: string }
export interface FiledList { kind: ListKind; id: string; name: string; folderId: string | null }

const TABLE: Record<ListKind, "visit_collections" | "moodboards" | "place_collections"> = {
  been: "visit_collections",
  board: "moodboards",
  saved: "place_collections",
};

/** Folders and every list, in one consistent read or not at all. */
export async function getFoldersAndLists(
  personId: string,
  db: Db = getSupabase(),
): Promise<{ folders: FolderView[]; lists: ListRead<FiledList> }> {
  const [folders, ...lists] = await Promise.all([
    db.from("folders").select("id, name, emoji").eq("person_id", personId).order("name"),
    ...(Object.keys(TABLE) as ListKind[]).map((kind) =>
      db.from(TABLE[kind]).select("id, name, folder_id").eq("person_id", personId).order("created_at")
        .then(({ data, error }) => ({ kind, data, error }))),
  ]);
  if (folders.error || lists.some((read) => read.error)) return { folders: [], lists: { rows: [], failed: true } };
  return {
    folders: (folders.data ?? []) as FolderView[],
    lists: {
      rows: lists.flatMap(({ kind, data }) => ((data ?? []) as { id: string; name: string; folder_id: string | null }[])
        .map((row) => ({ kind, id: row.id, name: row.name, folderId: row.folder_id }))),
      failed: false,
    },
  };
}

/** Why a folder write was refused, so the screen can say which. */
export type FolderRefusal = "taken" | "invalid" | "failed";
const refusal = (code: string | undefined): FolderRefusal =>
  code === "23505" ? "taken" : code === "23514" ? "invalid" : "failed";

/** The DB's 40-character limit, counted in code points as char_length does (an emoji is one, not two). */
const cleanName = (name: string) => Array.from(name.trim()).slice(0, 40).join("");

/** The DB refuses control or bidi characters rather than rewriting them ("invalid"). */
export async function createFolder(personId: string, name: string, emoji: string, db: Db = getSupabase()): Promise<FolderView | FolderRefusal> {
  const trimmed = cleanName(name);
  if (!trimmed) return "invalid";
  const { data, error } = await db.from("folders")
    .insert({ person_id: personId, name: trimmed, ...(emoji.trim() ? { emoji: emoji.trim() } : {}) })
    .select("id, name, emoji").single();
  if (error || !data) return refusal(error?.code);
  return data as FolderView;
}

export async function renameFolder(id: string, name: string, db: Db = getSupabase()): Promise<true | FolderRefusal> {
  const trimmed = cleanName(name);
  if (!trimmed) return "invalid";
  const { data, error } = await db.from("folders").update({ name: trimmed }).eq("id", id).select("id");
  if (error) return refusal(error.code);
  return (data?.length ?? 0) > 0 ? true : "failed";
}

export async function deleteFolder(id: string, db: Db = getSupabase()): Promise<boolean> {
  const { data, error } = await db.from("folders").delete().eq("id", id).select("id");
  return !error && (data?.length ?? 0) > 0;
}

/** null un-files the list. */
export async function moveToFolder(kind: ListKind, listId: string, folderId: string | null, db: Db = getSupabase()): Promise<boolean> {
  const { data, error } = await db.from(TABLE[kind]).update({ folder_id: folderId }).eq("id", listId).select("id");
  return !error && (data?.length ?? 0) > 0;
}

/** Folders by name with their lists, then "Unfiled" (null) when anything is. */
export function groupByFolder(folders: FolderView[], lists: FiledList[]): { folder: FolderView | null; lists: FiledList[] }[] {
  const known = new Set(folders.map((f) => f.id));
  const groups: { folder: FolderView | null; lists: FiledList[] }[] =
    folders.map((folder) => ({ folder, lists: lists.filter((list) => list.folderId === folder.id) }));
  const unfiled = lists.filter((list) => !list.folderId || !known.has(list.folderId));
  return unfiled.length ? [...groups, { folder: null, lists: unfiled }] : groups;
}
