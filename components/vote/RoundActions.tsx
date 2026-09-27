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
  firstUnchosen,
  onContinue,
  onGoToPool,
  onDecide,
  nudge,
}: {
  isHost: boolean;
  stage: PlanStage;
  activePool: number;
  poolCount: number;
  deciding: boolean;
  hasCurrentSelection: boolean;
  allPoolsChosen: boolean;
  /** The earliest pool round this voter hasn't picked in, if any. */
  firstUnchosen: number | null;
  onContinue: () => void;
  onGoToPool: (pool: number) => void;
  onDecide: () => void;
  /** P31: the host just opened the final round; tell the group. */
  nudge?: { href: string; dismiss: () => void } | null;
}) {
  return (
    <>
      {nudge && stage === "final" && (
        <p className="mt-5 flex flex-wrap items-center gap-x-3 rounded-xl border border-line bg-card px-4 py-2 text-sm" role="status">
          <span className="font-medium">The final round is open.</span>
          <a href={nudge.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
            Tell the group on WhatsApp
          </a>
          <button type="button" onClick={nudge.dismiss} className="ml-auto min-h-11 text-muted underline underline-offset-4">Dismiss</button>
        </p>
      )}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        {!isHost && stage === "pool" && !allPoolsChosen ? (
          // P2: moving between pool rounds is local, so every member does it
          // alone; only building the shortlist and deciding are host-only
          // (execute_plan_command checks the host on every command).
          <button
            type="button"
            onClick={() => (activePool < poolCount ? onContinue() : onGoToPool(firstUnchosen ?? 1))}
            disabled={!hasCurrentSelection}
            className="vote-primary-action flex-1 rounded-2xl border-2 border-ink font-display text-lg font-extrabold disabled:opacity-40"
          >
            {activePool < poolCount ? "Next round" : `Go to round ${firstUnchosen}`}
          </button>
        ) : !isHost ? (
          <p className="flex-1 self-center text-sm font-medium text-muted">
            {stage === "pool" ? "Waiting for the host to build the final shortlist." : "Waiting for the host to continue."}
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
                ? `Continue to round ${activePool + 1}`
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
          ? stage === "pool"
            ? "Pick one in each round. You can change your choice before moving on."
            : "Choose one place. You can change your choice until the host decides."
          : !isHost
            ? stage === "pool" && !allPoolsChosen
              ? `Round ${activePool} is set. Pick one in each round.`
              : "Your picks are in. The host moves things along once everyone’s ready."
            : stage === "pool" && activePool < poolCount
              ? `Round ${activePool} is set. Continue when you’re ready.`
              : stage === "pool"
                ? "All rounds are set. Build the final shortlist when everyone has had a chance to vote."
                : "The final shortlist is ready. Choose the place the group should visit."}
      </p>
    </>
  );
}
