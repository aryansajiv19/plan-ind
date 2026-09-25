"use client";

import { useState } from "react";
import Link from "next/link";
import type { BoardSpot } from "@/lib/social";
import { boardWriteError, type MoodboardsState } from "@/components/account/useMoodboards";

/**
 * "Save to board" for one catalogue place: on a Discover card and on the
 * place page. Opens inline (no popover to lose on a phone), lists the
 * person's boards, and says in words which ones already hold the place.
 */
export default function SaveToBoard({
  spot,
  boards,
  onOpen,
}: {
  spot: BoardSpot;
  boards: MoodboardsState;
  /** First open, for callers that load boards lazily. */
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const panelId = `save-board-${spot.id}`;

  async function save(boardId: string, boardName: string) {
    setPending(boardId);
    const result = await boards.addPlace(boardId, spot);
    setPending(null);
    setMessage(result === "failed" ? `Couldn’t save to ${boardName}. Try again.` : `Saved to ${boardName}.`);
  }

  async function createAndSave(event: React.FormEvent) {
    event.preventDefault();
    setPending("new");
    const created = await boards.createBoard(newName);
    if (!created.ok) {
      setPending(null);
      setMessage(boardWriteError(created));
      return;
    }
    setNewName("");
    await save(created.value.id, created.value.name);
  }

  return (
    <div className="save-board">
      <button type="button" className="save-board__toggle" aria-expanded={open} aria-controls={panelId} onClick={() => { if (!open) onOpen?.(); setOpen(!open); }}>
        {open ? "Close boards" : "Save to board"}
      </button>
      {open && (
        <div id={panelId} className="save-board__panel">
          {boards.status === "loading" && <p className="save-board__note">Loading your boards…</p>}
          {boards.status === "failed" && (
            <p className="save-board__note" role="alert">
              Couldn’t load your boards. <button type="button" onClick={boards.retry}>Try again</button>
            </p>
          )}
          {boards.status === "ready" && (
            <>
              {boards.boards.length > 0 && (
                <ul className="demo-board-tabs" aria-label={`Boards for ${spot.name}`}>
                  {boards.boards.map((board) => {
                    const saved = boards.hasPlace(board.id, spot.id);
                    return (
                      <li key={board.id}>
                        <button type="button" disabled={saved || pending !== null} onClick={() => void save(board.id, board.name)}>
                          {board.name}
                          <small>{saved ? "Already saved" : pending === board.id ? "Saving…" : `${board.items.length} saved`}</small>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {boards.canCreate ? (
                <form className="demo-inline-form" onSubmit={createAndSave}>
                  <label className="sr-only" htmlFor={`${panelId}-name`}>New board name</label>
                  <input id={`${panelId}-name`} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={boards.boards.length ? "Or a new board" : "Name your first board"} maxLength={40} />
                  <button type="submit" disabled={!newName.trim() || pending !== null}>{pending === "new" ? "Saving…" : "Create and save"}</button>
                </form>
              ) : boards.boards.length === 0 ? (
                <p className="save-board__note">No boards yet. <Link href="/home?view=discover">Start one in Discover</Link>.</p>
              ) : null}
            </>
          )}
          {message && <p className="save-board__note" role="status">{message}</p>}
        </div>
      )}
    </div>
  );
}
