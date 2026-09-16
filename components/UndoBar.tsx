"use client";

import { useEffect, useRef, useState } from "react";

/**
 * "Done. Undo?" for quick reversible actions (untag, remove from a collection,
 * clear your pick) instead of a confirm step. Irreversible deletes keep their
 * confirms. Disappears on its own; Undo reports honestly if it can't restore.
 */
export default function UndoBar({
  message,
  onUndo,
  onDone,
}: {
  message: string;
  /** Resolve true only when the server confirmed the restore. */
  onUndo: () => Promise<boolean>;
  onDone: () => void;
}) {
  const [state, setState] = useState<"idle" | "undoing" | "failed">("idle");
  // Latest onDone without restarting the timer: callers pass inline
  // callbacks, and a busy page (live votes) re-renders often enough that a
  // dependency on onDone would keep the bar up indefinitely.
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; });

  useEffect(() => {
    if (state !== "idle") return;
    const timer = setTimeout(() => onDoneRef.current(), 8000);
    return () => clearTimeout(timer);
  }, [state]);

  async function undo() {
    setState("undoing");
    if (await onUndo()) onDone();
    else setState("failed");
  }

  return (
    <div className="undo-bar" role="status">
      <span>{state === "failed" ? "Couldn’t undo that. Try again." : message}</span>
      {state === "failed" ? (
        <button type="button" onClick={onDone}>Dismiss</button>
      ) : (
        <button type="button" disabled={state === "undoing"} onClick={() => void undo()}>
          {state === "undoing" ? "Undoing…" : "Undo"}
        </button>
      )}
    </div>
  );
}
