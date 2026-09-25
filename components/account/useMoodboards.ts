"use client";

import { useEffect, useState } from "react";
import {
  addMoodboardItem,
  createMoodboard,
  deleteMoodboard,
  getBoardSpots,
  getMoodboards,
  removeMoodboardItem,
  renameMoodboard,
  restoreMoodboardItem,
  spotIdFromItem,
  type BoardSpot,
  type BoardWrite,
  type MoodboardView,
} from "@/lib/social";
import type { MoodboardItem } from "@/lib/types";

interface BoardsData {
  boards: MoodboardView[];
  spots: Record<string, BoardSpot>;
  /** The spot read failed: place tiles show their saved name only. */
  spotsFailed: boolean;
}

export type SaveResult = "saved" | "already" | "failed";
export type BoardsStatus = "loading" | "failed" | "ready";

const WRITE_ERROR: Record<Exclude<BoardWrite<unknown>, { ok: true }>["reason"], string> = {
  invalid: "Give it a name first.",
  duplicate: "You already have a board with that name.",
  failed: "Couldn’t save that. Try again.",
};
export const boardWriteError = (result: BoardWrite<unknown>) => (result.ok ? null : WRITE_ERROR[result.reason]);

/**
 * The signed-in person's moodboards. Loads on first use (`enabled`), not on
 * every /home view, and keeps the last good value across tab switches: the
 * caller (AccountViews, or the place page's save control) stays mounted.
 * Every change lands only after the server confirms the row.
 */
export default function useMoodboards(personId: string | null, enabled: boolean) {
  const [data, setData] = useState<BoardsData | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled || data) return;
    let cancelled = false;
    void (async () => {
      const boards = await getMoodboards(personId);
      if (cancelled) return;
      if (boards.failed) { setFailed(true); return; }
      const ids = boards.rows.flatMap((board) => board.items.map(spotIdFromItem)).filter((id): id is string => id !== null);
      const spots = await getBoardSpots(ids);
      if (cancelled) return;
      setFailed(false);
      setData({
        boards: boards.rows,
        spots: Object.fromEntries(spots.rows.map((spot) => [spot.id, spot])),
        spotsFailed: spots.failed,
      });
    })();
    return () => { cancelled = true; };
  }, [enabled, personId, attempt, data]);

  const status: BoardsStatus = data ? "ready" : failed ? "failed" : "loading";

  function retry() {
    setFailed(false);
    setAttempt((n) => n + 1);
  }

  function patchBoard(boardId: string, patch: (board: MoodboardView) => MoodboardView) {
    setData((current) => current && {
      ...current,
      boards: current.boards.map((board) => (board.id === boardId ? patch(board) : board)),
    });
  }

  async function createBoard(name: string): Promise<BoardWrite<MoodboardView>> {
    if (!personId) return { ok: false, reason: "failed" };
    const result = await createMoodboard(personId, name);
    if (result.ok) setData((current) => current && { ...current, boards: [...current.boards, result.value] });
    return result;
  }

  async function renameBoard(boardId: string, name: string): Promise<BoardWrite<string>> {
    const result = await renameMoodboard(boardId, name);
    if (result.ok) patchBoard(boardId, (board) => ({ ...board, name: result.value }));
    return result;
  }

  async function deleteBoard(boardId: string): Promise<boolean> {
    const ok = await deleteMoodboard(boardId);
    if (ok) setData((current) => current && { ...current, boards: current.boards.filter((b) => b.id !== boardId) });
    return ok;
  }

  function hasPlace(boardId: string, spotId: string): boolean {
    return Boolean(data?.boards.find((b) => b.id === boardId)?.items.some((item) => spotIdFromItem(item) === spotId));
  }

  async function addPlace(boardId: string, spot: BoardSpot): Promise<SaveResult> {
    if (hasPlace(boardId, spot.id)) return "already";
    const result = await addMoodboardItem(boardId, { kind: "place", spotId: spot.id, label: spot.name });
    if (!result.ok) return "failed";
    setData((current) => current && { ...current, spots: { ...current.spots, [spot.id]: spot } });
    patchBoard(boardId, (board) => ({ ...board, items: [result.value, ...board.items] }));
    return "saved";
  }

  async function addLink(boardId: string, url: string, label: string, note: string): Promise<BoardWrite<MoodboardItem>> {
    const result = await addMoodboardItem(boardId, { kind: "link", url, label, note });
    if (result.ok) patchBoard(boardId, (board) => ({ ...board, items: [result.value, ...board.items] }));
    return result;
  }

  function putBack(item: MoodboardItem) {
    patchBoard(item.moodboard_id, (board) => ({
      ...board,
      items: [...board.items.filter((i) => i.id !== item.id), item].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    }));
  }

  /** Removes an item; resolves to the Undo that restores it, or null. */
  async function removeItem(item: MoodboardItem): Promise<(() => Promise<boolean>) | null> {
    const ok = await removeMoodboardItem(item.id);
    if (!ok) return null;
    patchBoard(item.moodboard_id, (board) => ({ ...board, items: board.items.filter((i) => i.id !== item.id) }));
    return async () => {
      const restored = await restoreMoodboardItem(item);
      if (restored) putBack(item);
      return restored;
    };
  }

  return {
    status,
    boards: data?.boards ?? [],
    spots: data?.spots ?? {},
    spotsFailed: data?.spotsFailed ?? false,
    canCreate: personId !== null,
    retry,
    createBoard,
    renameBoard,
    deleteBoard,
    hasPlace,
    addPlace,
    addLink,
    removeItem,
  };
}

export type MoodboardsState = ReturnType<typeof useMoodboards>;
