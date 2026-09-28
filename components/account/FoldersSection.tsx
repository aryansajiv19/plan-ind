"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createFolder, deleteFolder, getFoldersAndLists, groupByFolder, moveToFolder, renameFolder,
  type FiledList, type FolderView, type ListKind,
} from "@/lib/social/folders";

const KIND_LABEL: Record<ListKind, string> = { been: "Been list", board: "Moodboard", saved: "Saved links" };

/**
 * Saved, in folders (081): every Been list, moodboard and saved-links list,
 * grouped by the account's own folders with an "Unfiled" group. Unstyled;
 * the lead styles it. A failed read says so; it never shows "no folders".
 */
export default function FoldersSection({ personId }: { personId: string }) {
  const [data, setData] = useState<{ folders: FolderView[]; lists: FiledList[] } | "failed" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    const read = await getFoldersAndLists(personId);
    setData(read.lists.failed ? "failed" : { folders: read.folders, lists: read.lists.rows });
  }, [personId]);

  useEffect(() => {
    let live = true;
    void getFoldersAndLists(personId).then((read) => {
      if (live) setData(read.lists.failed ? "failed" : { folders: read.folders, lists: read.lists.rows });
    });
    return () => { live = false; };
  }, [personId]);

  async function run(write: Promise<unknown>, failure: string) {
    setError(null);
    const ok = await write;
    if (!ok) setError(failure);
    await load();
  }

  if (data === null) return null;
  if (data === "failed") return <p role="alert">Your folders didn’t load. Refresh to try again.</p>;
  const groups = groupByFolder(data.folders, data.lists);

  return (
    <section className="saved-folders" aria-labelledby="saved-folders-title">
      <h2 id="saved-folders-title">Saved, in folders</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run(createFolder(personId, name, emoji), "That folder couldn’t be made. Is the name already taken?")
            .then(() => { setName(""); setEmoji(""); });
        }}
      >
        <label><span>Emoji</span><input value={emoji} onChange={(event) => setEmoji(event.target.value)} maxLength={8} placeholder="📁" /></label>
        <label><span>Folder name</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} placeholder="Date nights" /></label>
        <button type="submit" disabled={!name.trim()}>New folder</button>
      </form>
      {error && <p role="alert">{error}</p>}

      {groups.map(({ folder, lists }) => (
        <div key={folder?.id ?? "unfiled"} className="saved-folders__group">
          {folder && renaming?.id === folder.id ? (
            <form onSubmit={(event) => {
              event.preventDefault();
              void run(renameFolder(folder.id, renaming.name), "That name couldn’t be saved.").then(() => setRenaming(null));
            }}>
              <input value={renaming.name} onChange={(event) => setRenaming({ id: folder.id, name: event.target.value })} maxLength={40} aria-label="Folder name" />
              <button type="submit">Save</button>
              <button type="button" onClick={() => setRenaming(null)}>Cancel</button>
            </form>
          ) : (
            <h3>
              {folder ? `${folder.emoji} ${folder.name}` : "Unfiled"}
              {folder && <button type="button" onClick={() => setRenaming({ id: folder.id, name: folder.name })}>Rename</button>}
              {folder && (confirmDelete === folder.id ? (
                <>
                  <button type="button" onClick={() => { setConfirmDelete(null); void run(deleteFolder(folder.id), "That folder couldn’t be deleted."); }}>Delete folder (lists stay)</button>
                  <button type="button" onClick={() => setConfirmDelete(null)}>Keep</button>
                </>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(folder.id)}>Delete</button>
              ))}
            </h3>
          )}
          {lists.length === 0 ? <p>Nothing here yet.</p> : (
            <ul>
              {lists.map((list) => (
                <li key={`${list.kind}:${list.id}`}>
                  <span>{list.name} · {KIND_LABEL[list.kind]}</span>
                  <label>
                    <span className="sr-only">Move {list.name} to folder</span>
                    <select
                      value={list.folderId ?? ""}
                      onChange={(event) => void run(moveToFolder(list.kind, list.id, event.target.value || null), "That list couldn’t be moved.")}
                    >
                      <option value="">Unfiled</option>
                      {data.folders.map((f) => <option key={f.id} value={f.id}>{f.emoji} {f.name}</option>)}
                    </select>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}
