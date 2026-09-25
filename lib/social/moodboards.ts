import { getSupabase } from "../supabase";
import type { Db, ListRead } from "./shared";
import type { Moodboard, MoodboardItem, Spot } from "../types";

// ─── Discover moodboards (migration 036, SPECS.md §15.3) ────────────
//
// Owner-scoped RLS ("manage own moodboards" / "... items", `for all`), the
// same single-owner shape as visit collections, so writes go straight
// through PostgREST. Every write ends in .select(): a write RLS refuses
// comes back 200 with zero rows, and only the returned row tells it apart
// from success.
//
// 036 has no spot_id column. A catalogue place is stored as kind "place"
// with source_url set to the app's own place page, "/place/<spot id>" — a
// real link to the thing saved, and the only place the id can live without
// a schema change. storage_path (images) is not written: no Storage bucket
// or policy for moodboard images exists, so there is nowhere real to put
// the bytes.

export type MoodboardView = Moodboard & { items: MoodboardItem[] };

/** The spot fields a board tile shows. Price, spend, hours, vibe and area
 *  are what people decide on, so they ride along with every place item. */
export type BoardSpot = Pick<
  Spot,
  "id" | "name" | "category" | "area" | "cuisine" | "price_band" | "min_spend" | "open_till" | "vibe" | "photo_url" | "photo_attribution"
>;

const BOARD_FIELDS = "id, person_id, name, theme, visibility, created_at";
const ITEM_FIELDS = "id, moodboard_id, kind, label, note, storage_path, source_url, created_at";
const SPOT_FIELDS = "id, name, category, area, cuisine, price_band, min_spend, open_till, vibe, photo_url, photo_attribution";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function placeSourcePath(spotId: string): string {
  return `/place/${spotId}`;
}

/** The catalogue spot a place item points at, or null for anything else. */
export function spotIdFromItem(item: Pick<MoodboardItem, "kind" | "source_url">): string | null {
  if (item.kind !== "place" || !item.source_url) return null;
  const match = /^\/place\/([^/?#]+)$/.exec(item.source_url);
  return match && UUID.test(match[1]) ? match[1] : null;
}

/**
 * An external link that is safe to put in an href: http(s) only, within the
 * column's length cap. Everything else (javascript:, data:, a bare word) is
 * refused on write and never rendered as a link on read.
 */
export function safeExternalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function newestFirst(a: { created_at: string }, b: { created_at: string }): number {
  return b.created_at.localeCompare(a.created_at);
}

/** The caller's boards with their items, newest save first. With no
 *  personId, RLS alone scopes the read to the caller's own boards. */
export async function getMoodboards(
  personId: string | null,
  db: Db = getSupabase(),
): Promise<ListRead<MoodboardView>> {
  let query = db.from("moodboards").select(`${BOARD_FIELDS}, items:moodboard_items(${ITEM_FIELDS})`);
  if (personId) query = query.eq("person_id", personId);
  const { data, error } = await query.order("created_at");
  if (error) return { rows: [], failed: true };
  const rows = ((data ?? []) as unknown as (Moodboard & { items: MoodboardItem[] | null })[])
    .map((board) => ({ ...board, items: [...(board.items ?? [])].sort(newestFirst) }));
  return { rows, failed: false };
}

/** The catalogue rows behind a board's place items. */
export async function getBoardSpots(ids: string[], db: Db = getSupabase()): Promise<ListRead<BoardSpot>> {
  const unique = [...new Set(ids)].filter((id) => UUID.test(id));
  if (unique.length === 0) return { rows: [], failed: false };
  const { data, error } = await db.from("spots").select(SPOT_FIELDS).in("id", unique);
  if (error) return { rows: [], failed: true };
  return { rows: (data ?? []) as BoardSpot[], failed: false };
}

export type BoardWrite<T> = { ok: true; value: T } | { ok: false; reason: "invalid" | "duplicate" | "failed" };

const cleanName = (name: string) => name.trim().slice(0, 40);

export async function createMoodboard(
  personId: string,
  name: string,
  db: Db = getSupabase(),
): Promise<BoardWrite<MoodboardView>> {
  const trimmed = cleanName(name);
  if (!trimmed) return { ok: false, reason: "invalid" };
  const { data, error } = await db
    .from("moodboards")
    .insert({ person_id: personId, name: trimmed })
    .select(BOARD_FIELDS)
    .maybeSingle();
  // 23505: moodboards_name_ci_idx, one board per name per person.
  if (error?.code === "23505") return { ok: false, reason: "duplicate" };
  if (error || !data) return { ok: false, reason: "failed" };
  return { ok: true, value: { ...(data as Moodboard), items: [] } };
}

export async function renameMoodboard(
  boardId: string,
  name: string,
  db: Db = getSupabase(),
): Promise<BoardWrite<string>> {
  const trimmed = cleanName(name);
  if (!trimmed) return { ok: false, reason: "invalid" };
  const { data, error } = await db.from("moodboards").update({ name: trimmed }).eq("id", boardId).select("name");
  if (error?.code === "23505") return { ok: false, reason: "duplicate" };
  if (error || !data?.length) return { ok: false, reason: "failed" };
  return { ok: true, value: data[0].name as string };
}

/** Deletes the board and (by cascade) its items. True only when a row went. */
export async function deleteMoodboard(boardId: string, db: Db = getSupabase()): Promise<boolean> {
  const { data, error } = await db.from("moodboards").delete().eq("id", boardId).select("id");
  return !error && (data?.length ?? 0) > 0;
}

export type NewBoardItem =
  | { kind: "place"; spotId: string; label: string; note?: string }
  | { kind: "link"; url: string; label?: string; note?: string };

type ItemRow = Pick<MoodboardItem, "moodboard_id" | "kind" | "label" | "note" | "source_url">;

/** The row to insert for an item, or null when the input cannot be saved. */
export function boardItemRow(boardId: string, item: NewBoardItem): ItemRow | null {
  const note = item.note?.trim().slice(0, 280) || null;
  if (item.kind === "place") {
    const label = item.label.trim().slice(0, 80);
    if (!UUID.test(item.spotId) || !label) return null;
    return { moodboard_id: boardId, kind: "place", label, note, source_url: placeSourcePath(item.spotId) };
  }
  const url = safeExternalUrl(item.url);
  if (!url) return null;
  const label = (item.label?.trim() || new URL(url).hostname.replace(/^www\./, "")).slice(0, 80);
  return { moodboard_id: boardId, kind: "link", label, note, source_url: url };
}

export async function addMoodboardItem(
  boardId: string,
  item: NewBoardItem,
  db: Db = getSupabase(),
): Promise<BoardWrite<MoodboardItem>> {
  const row = boardItemRow(boardId, item);
  if (!row) return { ok: false, reason: "invalid" };
  const { data, error } = await db.from("moodboard_items").insert(row).select(ITEM_FIELDS).maybeSingle();
  if (error || !data) return { ok: false, reason: "failed" };
  return { ok: true, value: data as MoodboardItem };
}

/** Removes one item. True only when the server confirms the row went. */
export async function removeMoodboardItem(itemId: string, db: Db = getSupabase()): Promise<boolean> {
  const { data, error } = await db.from("moodboard_items").delete().eq("id", itemId).select("id");
  return !error && (data?.length ?? 0) > 0;
}

/** Undo for a removal: puts the exact row back, same id and position. */
export async function restoreMoodboardItem(item: MoodboardItem, db: Db = getSupabase()): Promise<boolean> {
  const { data, error } = await db
    .from("moodboard_items")
    .insert({
      id: item.id,
      moodboard_id: item.moodboard_id,
      kind: item.kind,
      label: item.label,
      note: item.note,
      source_url: item.source_url,
      created_at: item.created_at,
    })
    .select("id");
  return !error && (data?.length ?? 0) > 0;
}
