import type { Dispatch, SetStateAction } from "react";
import { toLocalInput, type HostCommands } from "@/hooks/use-host-commands";
import type { Plan } from "@/lib/types";

// Host-only edit and delete, shown under the vote while the plan is open.
export function HostPlanControls({
  host,
  plan,
  voterCount,
  canEdit,
}: {
  host: HostCommands;
  plan: Plan | null;
  voterCount: number;
  canEdit: boolean;
}) {
  const { isHost, editing, setEditing, editPending, editError, setEditError, saveEdit, confirmDelete, setConfirmDelete, deciding, deletePlan } = host;
  return (
    <>
      {/* R1. A hard delete for everyone on the link, with no undo by
          construction — acceptable only because it is hard to do by
          accident. The confirm names the plan and who it takes with it;
          the count is read from votes already on screen, because the
          server only reports participants after the delete. */}
      {/* An open form stays open even if a vote lands meanwhile: hiding it
          would silently throw away what the host typed. The save then
          comes back voting_started and says why. */}
      {isHost && editing && (
        <form className="vote-edit" onSubmit={(event) => { event.preventDefault(); void saveEdit(); }}>
          <label>
            <span>Title</span>
            <input value={editing.title} maxLength={60} onChange={(event) => setEditing({ ...editing, title: event.target.value })} />
          </label>
          <label>
            <span>Voting closes</span>
            <input type="datetime-local" value={editing.deadline} onChange={(event) => setEditing({ ...editing, deadline: event.target.value })} />
          </label>
          <div className="vote-edit__actions">
            <button type="submit" className="vote-edit__save" disabled={editPending || !editing.title.trim()}>
              {editPending ? "Saving…" : "Save changes"}
            </button>
            <button type="button" disabled={editPending} onClick={() => { setEditing(null); setEditError(null); }}>Cancel</button>
          </div>
          {editError && <p role="alert" className="vote-edit__error">{editError}</p>}
        </form>
      )}
      {isHost && (
        <div className="vote-delete">
          {isHost && canEdit && !editing && !confirmDelete && (
            <button type="button" onClick={() => { setEditError(null); setEditing({ title: plan!.title, deadline: toLocalInput(plan!.deadline) }); }}>
              Edit this plan
            </button>
          )}
          {editError && !editing && <p role="alert" className="vote-edit__error">{editError}</p>}
          {confirmDelete ? (
            <div className="vote-delete__confirm" role="group" aria-label="Confirm delete">
              <p>
                Delete “{plan!.title}”?{" "}
                {voterCount === 0
                  ? "Nobody has voted yet."
                  : `${voterCount} ${voterCount === 1 ? "person has" : "people have"} voted, and it disappears for all of them.`}{" "}
                This can’t be undone.
              </p>
              <button type="button" className="vote-delete__go" disabled={deciding} onClick={() => void deletePlan()}>
                {deciding ? "Deleting…" : "Delete plan"}
              </button>
              <button type="button" disabled={deciding} onClick={() => setConfirmDelete(false)}>Keep it</button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)}>Delete this plan</button>
          )}
        </div>
      )}
    </>
  );
}

export function ReopenControl({
  host,
  plan,
  decided,
  ratingCount,
}: {
  host: HostCommands;
  plan: Plan | null;
  decided: boolean;
  ratingCount: number;
}) {
  const { isHost, confirmReopen, setConfirmReopen, reopening, reopenPlan } = host;
  return (
    <>
      {/* C7: host only, decided plans. */}
      {/* Hidden once anyone has rated: 057 refuses (already_happened). A
          logged visit also refuses but isn't readable here, so the server's
          message still covers that case. */}
      {isHost && decided && ratingCount === 0 && (
        <div className="vote-delete vote-reopen">
          {confirmReopen ? (
            <div className="vote-delete__confirm" role="group" aria-label="Confirm reopen">
              <p>
                Reopen voting on “{plan!.title}”? Everyone goes back to the final shortlist.
                RSVPs, carpool and the plan time stay; people should check them once a new place is picked.
              </p>
              <button type="button" disabled={reopening} onClick={() => void reopenPlan()}>
                {reopening ? "Reopening…" : "Reopen voting"}
              </button>
              <button type="button" disabled={reopening} onClick={() => setConfirmReopen(false)}>Keep the decision</button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmReopen(true)}>Reopen voting</button>
          )}
        </div>
      )}
    </>
  );
}

export function LeaveControl({
  isHost,
  plan,
  decided,
  confirmLeave,
  setConfirmLeave,
  leaving,
  leavePlan,
}: {
  isHost: boolean;
  plan: Plan | null;
  decided: boolean;
  confirmLeave: boolean;
  setConfirmLeave: Dispatch<SetStateAction<boolean>>;
  leaving: boolean;
  leavePlan: () => Promise<void>;
}) {
  return (
    <>
      {/* C6. Never the host: they delete instead (leave_plan refuses them). */}
      {!isHost && (
        <div className="vote-delete vote-leave">
          {confirmLeave ? (
            <div className="vote-delete__confirm" role="group" aria-label="Confirm leave">
              <p>
                Leave “{plan!.title}”?{" "}
                {decided
                  ? "Your RSVP and rating will be removed; your votes stay as part of how the group decided."
                  : "Your votes and RSVP will be removed. You can rejoin with the link."}
              </p>
              <button type="button" className="vote-delete__go" disabled={leaving} onClick={() => void leavePlan()}>
                {leaving ? "Leaving…" : "Leave plan"}
              </button>
              <button type="button" disabled={leaving} onClick={() => setConfirmLeave(false)}>Stay</button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmLeave(true)}>Leave this plan</button>
          )}
        </div>
      )}
    </>
  );
}
