import type { PlanStage } from "@/lib/types";

// The round-advance control and its hint, under the cards while voting.
export default function RoundActions({
  isHost,
  stage,
  activePool,
  poolCount,
  deciding,
  hasCurrentSelection,
  allPoolsChosen,
  onContinue,
  onDecide,
}: {
  isHost: boolean;
  stage: PlanStage;
  activePool: number;
  poolCount: number;
  deciding: boolean;
  hasCurrentSelection: boolean;
  allPoolsChosen: boolean;
  onContinue: () => void;
  onDecide: () => void;
}) {
  return (
    <>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        {!isHost ? (
          // advanceToFinal/decide are host-only server-side
          // (execute_plan_command checks the host on every command) —
          // a non-host tapping a "Continue" button here would just get an
          // optimistic flash that reverts with a generic error. Voting
          // itself is unaffected; only the round-advance control is gated.
          <p className="flex-1 self-center text-sm font-medium text-muted">
            Waiting for the host to continue.
          </p>
        ) : stage === "pool" ? (
          <button
            type="button"
            onClick={onContinue}
            disabled={deciding || !hasCurrentSelection || (activePool === poolCount && !allPoolsChosen)}
            className="vote-primary-action flex-1 rounded-2xl border-2 border-ink font-display text-lg font-extrabold disabled:opacity-40"
          >
            {deciding
              ? "Building the shortlist…"
              : activePool < poolCount
                ? `Continue to pool ${activePool + 1}`
                : "Build the final shortlist"}
          </button>
        ) : (
          <button
            type="button"
            onClick={onDecide}
            disabled={deciding || !hasCurrentSelection}
            className="vote-primary-action flex-1 rounded-2xl border-2 border-ink font-display text-lg font-extrabold disabled:opacity-40"
          >
            {deciding ? "Choosing…" : "Choose the final place"}
          </button>
        )}
      </div>
      <p className="vote-action-hint" aria-live="polite">
        {!hasCurrentSelection
          ? "Choose one place to continue. You can change your choice before moving on."
          : !isHost
            ? "Your vote is in. The host will move things along once everyone’s ready."
            : stage === "pool" && activePool < poolCount
              ? `Pool ${activePool} is set. Continue when you’re ready.`
              : stage === "pool"
                ? "All pools are set. Build the final shortlist when everyone has had a chance to vote."
                : "The final shortlist is ready. Choose the place the group should visit."}
      </p>
    </>
  );
}
