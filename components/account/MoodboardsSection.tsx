"use client";

import { useState } from "react";
import PhotoWall from "@/components/PhotoWall";
import UndoBar from "@/components/UndoBar";
import MoodboardTile from "@/components/account/MoodboardTile";
import { boardWriteError, type MoodboardsState } from "@/components/account/useMoodboards";
import { CATEGORIES } from "@/components/categoryGroups";
import { minimumAgeForCategory } from "@/lib/age-policy";
import { boardPlanPrefill, type PlanPrefill } from "@/lib/board-plan";
import { spotIdFromItem, type BoardSpot } from "@/lib/social";
import type { MoodboardItem } from "@/lib/types";

/**
 * Discover's real moodboards (SPECS.md §15.3): the demo panel's pattern —
 * board tabs, add by kind, a note — on migration 036's tables, laid out as
 * a masonry board. Places are pinned from the cards below ("Save to
 * board"); links are added here. Images are not offered: 036 has no
 * Storage bucket for them.
 */
export default function MoodboardsSection({
  boards,
  age,
  onPlanFromBoard,
}: {
  boards: MoodboardsState;
  age: number;
  onPlanFromBoard: (prefill: PlanPrefill) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [link, setLink] = useState({ url: "", label: "", note: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ message: string; restore: () => Promise<boolean> } | null>(null);

  // Derived, not synced: the picked board while it exists, else the first.
  const board = boards.boards.find((b) => b.id === selected) ?? boards.boards[0];
  const places = board
    ? board.items.map(spotIdFromItem).map((id) => (id ? boards.spots[id] : undefined)).filter((s): s is BoardSpot => Boolean(s))
    : [];

  async function run(key: string, work: () => Promise<string | null>) {
    setBusy(key);
    setError(null);
    const failure = await work();
    setBusy(null);
    setError(failure);
  }

  const create = (event: React.FormEvent) => {
    event.preventDefault();
    void run("create", async () => {
      const result = await boards.createBoard(newName);
      if (result.ok) { setNewName(""); setSelected(result.value.id); }
      return boardWriteError(result);
    });
  };

  const rename = (event: React.FormEvent) => {
    event.preventDefault();
    if (!board || renaming === null) return;
    void run("rename", async () => {
      const result = await boards.renameBoard(board.id, renaming);
      if (result.ok) setRenaming(null);
      return boardWriteError(result);
    });
  };

  const remove = () => {
    if (!board) return;
    void run("delete", async () => {
      const ok = await boards.deleteBoard(board.id);
      setDeleteArmed(false);
      if (ok) setSelected(null);
      return ok ? null : `Couldn’t delete ${board.name}. Try again.`;
    });
  };

  const addLink = (event: React.FormEvent) => {
    event.preventDefault();
    if (!board) return;
    void run("link", async () => {
      const result = await boards.addLink(board.id, link.url, link.label, link.note);
      if (result.ok) { setLink({ url: "", label: "", note: "" }); return null; }
      return result.reason === "invalid" ? "Paste a full web address, starting with https://" : "Couldn’t add that link. Try again.";
    });
  };

  const removeItem = (item: MoodboardItem) => {
    if (!board) return;
    const name = board.name;
    void run(item.id, async () => {
      const restore = await boards.removeItem(item);
      if (!restore) return "Couldn’t remove that. Try again.";
      setUndo({ message: `${item.label} removed from ${name}.`, restore });
      return null;
    });
  };

  const plan = () => {
    if (!board) return;
    const allowed = (category: string) => CATEGORIES.some((c) => c.key === category) && age >= minimumAgeForCategory(category);
    onPlanFromBoard(boardPlanPrefill(board, places, allowed, `${board.id}:${Date.now()}`));
  };

  return (
    <section className="demo-tool-panel demo-moodboard-panel" aria-labelledby="moodboards-title">
      <div className="demo-tool-panel__head">
        <div>
          <p className="home-section-kicker">Moodboards</p>
          <h2 id="moodboards-title">Keep the feeling, not just the venue.</h2>
        </div>
      </div>

      {boards.status === "loading" && <PhotoWall items={[]} loading />}
      {boards.status === "failed" && (
        <p className="demo-empty" role="alert">
          Couldn’t load your boards. They are still saved. <button type="button" className="demo-primary-action" onClick={boards.retry}>Try again</button>
        </p>
      )}

      {boards.status === "ready" && (
        <>
          <form className="demo-inline-form" onSubmit={create}>
            <label className="sr-only" htmlFor="new-board-name">New board name</label>
            <input id="new-board-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name a board: birthday, summer, date night" maxLength={40} />
            <button type="submit" disabled={!newName.trim() || busy !== null}>{busy === "create" ? "Creating…" : "New board"}</button>
          </form>

          {!board ? (
            <p className="demo-empty">
              No boards yet. Start one for a birthday, a summer or a slow Friday, then use “Save to board” on any place below. Links from anywhere can go on it too.
            </p>
          ) : (
            <>
              <div className="demo-board-tabs" role="group" aria-label="Your boards">
                {boards.boards.map((b) => (
                  <button key={b.id} type="button" aria-pressed={b.id === board.id} onClick={() => { setSelected(b.id); setDeleteArmed(false); setRenaming(null); }}>
                    {b.name}<small>{b.items.length} saved</small>
                  </button>
                ))}
              </div>

              <div className="board-head">
                {renaming !== null ? (
                  <form className="demo-inline-form" onSubmit={rename}>
                    <label className="sr-only" htmlFor="rename-board">Board name</label>
                    <input id="rename-board" value={renaming} onChange={(e) => setRenaming(e.target.value)} maxLength={40} autoFocus />
                    <button type="submit" disabled={!renaming.trim() || busy !== null}>Save name</button>
                    <button type="button" onClick={() => setRenaming(null)}>Cancel</button>
                  </form>
                ) : deleteArmed ? (
                  <div className="demo-inline-form" role="group" aria-label="Confirm delete">
                    <span>Delete {board.name} and everything on it?</span>
                    <button type="button" onClick={remove} disabled={busy !== null}>{busy === "delete" ? "Deleting…" : "Delete board"}</button>
                    <button type="button" onClick={() => setDeleteArmed(false)}>Keep it</button>
                  </div>
                ) : (
                  <div className="demo-inline-form">
                    <button type="button" onClick={() => setRenaming(board.name)}>Rename</button>
                    <button type="button" onClick={() => setDeleteArmed(true)}>Delete board</button>
                    <button type="button" className="board-plan" onClick={plan} disabled={places.length === 0}>Plan from this board</button>
                  </div>
                )}
                {places.length === 0 && board.items.length > 0 && <p className="save-board__note">Save a place to plan from this board.</p>}
              </div>

              <form className="demo-inline-form" onSubmit={addLink} aria-label={`Add a link to ${board.name}`}>
                <label className="sr-only" htmlFor="board-link-url">Link</label>
                <input id="board-link-url" type="url" inputMode="url" value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} placeholder="https:// a menu, a reel, a review" maxLength={2048} />
                <label className="sr-only" htmlFor="board-link-label">Title</label>
                <input id="board-link-label" value={link.label} onChange={(e) => setLink({ ...link, label: e.target.value })} placeholder="Title (optional)" maxLength={80} />
                <label className="sr-only" htmlFor="board-link-note">Note</label>
                <input id="board-link-note" value={link.note} onChange={(e) => setLink({ ...link, note: e.target.value })} placeholder="Note (optional)" maxLength={280} />
                <button type="submit" disabled={!link.url.trim() || busy !== null}>{busy === "link" ? "Adding…" : "Add link"}</button>
              </form>

              {boards.spotsFailed && <p className="save-board__note">Place details couldn’t load. Names are shown instead.</p>}
              {board.items.length > 0 ? (
                <div className="board-grid">
                  {board.items.map((item, index) => {
                    const id = spotIdFromItem(item);
                    return (
                      <MoodboardTile key={item.id} item={item} spot={id ? boards.spots[id] : undefined} index={index} removing={busy === item.id} onRemove={() => removeItem(item)} />
                    );
                  })}
                </div>
              ) : (
                <p className="wall-empty">{board.name} is empty. Use “Save to board” on any place below, or add a link above.</p>
              )}
            </>
          )}
        </>
      )}

      {error && <p className="auth-error" role="alert">{error}</p>}
      {undo && <UndoBar key={undo.message} message={undo.message} onUndo={undo.restore} onDone={() => setUndo(null)} />}
    </section>
  );
}
