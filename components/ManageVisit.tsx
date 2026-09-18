"use client";

import { useState } from "react";
import { deleteVisit, deleteVisitPhoto, retagCompanion, untagCompanion, updateVisit, type VisitPhotoView } from "@/lib/social";
import UndoBar from "@/components/UndoBar";
import type { CompanionView, ProfileVisit } from "@/lib/types";

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

/**
 * The return path for the Been log: edit a visit, delete it, or remove a
 * person tagged on it. The deletes are hard and have no undo, so each takes a
 * second tap that names exactly what goes. Nothing leaves the screen until the
 * server confirms it — the item is re-read via `onChanged`, never removed
 * optimistically, because a visit that vanishes here and survives in the
 * database is the silent failure this repo keeps shipping.
 */
export default function ManageVisit({
  visits,
  photos,
  onChanged,
}: {
  visits: ProfileVisit[];
  photos: VisitPhotoView[];
  onChanged: () => void;
}) {
  const [visitId, setVisitId] = useState("");
  // "visit" or a visit_companions.id: which destructive action is armed.
  const [armed, setArmed] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Untagging is quick and reversible, so it happens in one tap with Undo
  // rather than a confirm. Deletes keep their confirm: they can't be undone.
  const [undo, setUndo] = useState<{ message: string; restore: () => Promise<boolean> } | null>(null);
  // The edit draft, or null when the form is closed. Only the three columns
  // 052 grants: the place and the plan are delete-and-relog.
  const [draft, setDraft] = useState<{ visited_at: string; group_label: string; note: string } | null>(null);
  const [saved, setSaved] = useState(false);

  async function saveEdit(visitId: string) {
    if (!draft) return;
    setPending(true);
    setError(null);
    const stored = await updateVisit(visitId, {
      visited_at: new Date(draft.visited_at).toISOString(),
      group_label: draft.group_label.trim() || null,
      note: draft.note.trim() || null,
    });
    setPending(false);
    if (!stored) { setError("Couldn’t save that change. Nothing was edited — try again."); return; }
    // Show what the server stored, not what was typed: it trims on write.
    setDraft({
      visited_at: stored.visited_at.slice(0, 10),
      group_label: stored.group_label ?? "",
      note: stored.note ?? "",
    });
    setSaved(true);
    onChanged();
  }

  async function untag(visitId: string, companion: CompanionView) {
    setPending(true);
    setError(null);
    const ok = await untagCompanion(companion.id);
    setPending(false);
    if (!ok) { setError(`Couldn’t remove ${companion.name}. Try again.`); return; }
    onChanged();
    setUndo({
      message: `Removed ${companion.name}.`,
      restore: async () => {
        const restored = await retagCompanion(visitId, companion);
        if (restored) onChanged();
        return restored;
      },
    });
  }

  const visit = visits.find((v) => v.id === visitId) ?? null;
  const visitPhotos = visit ? photos.filter((photo) => photo.visit_id === visit.id) : [];
  const armedIsVisit = armed === "visit";
  const label = (v: ProfileVisit) =>
    `${v.spot?.name ?? "Removed place"} · ${DATE_FORMAT.format(new Date(v.visited_at))}`;

  async function run(action: () => Promise<boolean>, failure: string) {
    setPending(true);
    setError(null);
    const ok = await action();
    setPending(false);
    setArmed(null);
    if (!ok) {
      setError(failure);
      return;
    }
    if (armedIsVisit) setVisitId("");
    onChanged();
  }

  return (
    <div className="demo-visit__collection-action manage-visit">
      <label>
        <span>Edit or delete a visit</span>
        <select
          value={visitId}
          onChange={(event) => { setVisitId(event.target.value); setArmed(null); setError(null); setDraft(null); setSaved(false); }}
        >
          <option value="">Choose…</option>
          {visits.map((v) => <option key={v.id} value={v.id}>{label(v)}</option>)}
        </select>
      </label>

      {visit && (
        <div className="manage-visit__panel">
          {visitPhotos.length > 0 && (
            <ul className="manage-visit__photos" aria-label={`Photos on ${label(visit)}`}>
              {visitPhotos.map((photo, index) => (
                <li key={photo.id}>
                  {photo.url
                    ? /* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from a private bucket; the optimiser must never fetch it */
                      <img src={photo.url} alt={photo.caption ?? `Photo ${index + 1}`} />
                    : <span className="manage-visit__photo-missing">Photo {index + 1}</span>}
                  {armed === `photo:${photo.id}` ? (
                    <span className="manage-visit__confirm">
                      <button type="button" disabled={pending} onClick={() => void run(() => deleteVisitPhoto(photo), "Couldn’t delete that photo. Nothing was removed — try again.")}>
                        Delete photo
                      </button>
                      <button type="button" disabled={pending} onClick={() => setArmed(null)}>Cancel</button>
                    </span>
                  ) : (
                    <button type="button" disabled={pending} onClick={() => setArmed(`photo:${photo.id}`)}>Delete</button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {visit.companions.length > 0 && (
            <ul className="manage-visit__people" aria-label={`People tagged on ${label(visit)}`}>
              {visit.companions.map((c) => (
                <li key={c.id}>
                  <span>{c.name}</span>
                  <button type="button" disabled={pending} onClick={() => void untag(visit.id, c)}>Untag</button>
                </li>
              ))}
            </ul>
          )}

          {draft ? (
            <form
              className="manage-visit__edit"
              onSubmit={(event) => { event.preventDefault(); void saveEdit(visit.id); }}
            >
              <label>
                <span>When</span>
                <input type="date" max={new Date().toISOString().slice(0, 10)} value={draft.visited_at}
                  onChange={(event) => { setDraft({ ...draft, visited_at: event.target.value }); setSaved(false); }} />
              </label>
              <label>
                <span>Who with</span>
                <input value={draft.group_label} maxLength={40} placeholder="e.g. the usual five"
                  onChange={(event) => { setDraft({ ...draft, group_label: event.target.value }); setSaved(false); }} />
              </label>
              <label>
                <span>Note</span>
                <textarea value={draft.note} maxLength={280} rows={2}
                  onChange={(event) => { setDraft({ ...draft, note: event.target.value }); setSaved(false); }} />
              </label>
              <p className="manage-visit__edit-actions">
                <button type="submit" disabled={pending || !draft.visited_at}>{pending ? "Saving…" : "Save changes"}</button>
                <button type="button" disabled={pending} onClick={() => { setDraft(null); setSaved(false); }}>Close</button>
                <span role="status">{saved ? "Saved." : ""}</span>
              </p>
            </form>
          ) : (
            <button type="button" className="manage-visit__edit-open" disabled={pending} onClick={() => setDraft({
              visited_at: visit.visited_at.slice(0, 10),
              group_label: visit.group_label ?? "",
              note: visit.note ?? "",
            })}>
              Edit this visit
            </button>
          )}

          {armedIsVisit ? (
            <p className="manage-visit__confirm" role="group" aria-label="Confirm delete">
              <span>Delete {label(visit)}? Its tags and photos go with it. This can’t be undone.</span>
              <button type="button" disabled={pending} onClick={() => void run(() => deleteVisit(visit.id), "Couldn’t finish deleting that visit. Try again — it picks up where it stopped.")}>
                {pending ? "Deleting…" : "Delete visit"}
              </button>
              <button type="button" disabled={pending} onClick={() => setArmed(null)}>Cancel</button>
            </p>
          ) : (
            <button type="button" className="manage-visit__delete" disabled={pending} onClick={() => setArmed("visit")}>
              Delete this visit
            </button>
          )}
        </div>
      )}

      {error && <p role="alert" className="manage-visit__error">{error}</p>}
      {undo && <UndoBar key={undo.message} message={undo.message} onUndo={undo.restore} onDone={() => setUndo(null)} />}
    </div>
  );
}
