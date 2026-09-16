"use client";

import { useState } from "react";
import { deleteVisit, untagCompanion } from "@/lib/social";
import type { ProfileVisit } from "@/lib/types";

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

/**
 * The return path for the Been log: delete a visit, or remove a person
 * tagged on it. Both are hard deletes with no undo, so each takes a second
 * tap that names exactly what goes. Nothing leaves the screen until the
 * server confirms it — the item is re-read via `onChanged`, never removed
 * optimistically, because a visit that vanishes here and survives in the
 * database is the silent failure this repo keeps shipping.
 */
export default function ManageVisit({
  visits,
  onChanged,
}: {
  visits: ProfileVisit[];
  onChanged: () => void;
}) {
  const [visitId, setVisitId] = useState("");
  // "visit" or a visit_companions.id: which destructive action is armed.
  const [armed, setArmed] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visit = visits.find((v) => v.id === visitId) ?? null;
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
          onChange={(event) => { setVisitId(event.target.value); setArmed(null); setError(null); }}
        >
          <option value="">Choose…</option>
          {visits.map((v) => <option key={v.id} value={v.id}>{label(v)}</option>)}
        </select>
      </label>

      {visit && (
        <div className="manage-visit__panel">
          {visit.companions.length > 0 && (
            <ul className="manage-visit__people" aria-label={`People tagged on ${label(visit)}`}>
              {visit.companions.map((c) => (
                <li key={c.id}>
                  <span>{c.name}</span>
                  {armed === c.id ? (
                    <span className="manage-visit__confirm">
                      <button type="button" disabled={pending} onClick={() => void run(() => untagCompanion(c.id), `Couldn’t remove ${c.name}. Try again.`)}>
                        Remove {c.name}
                      </button>
                      <button type="button" disabled={pending} onClick={() => setArmed(null)}>Cancel</button>
                    </span>
                  ) : (
                    <button type="button" disabled={pending} onClick={() => setArmed(c.id)}>Untag</button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {armedIsVisit ? (
            <p className="manage-visit__confirm" role="group" aria-label="Confirm delete">
              <span>Delete {label(visit)}? Its tags and photos go with it. This can’t be undone.</span>
              <button type="button" disabled={pending} onClick={() => void run(() => deleteVisit(visit.id), "Couldn’t delete that visit. Try again.")}>
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
    </div>
  );
}
