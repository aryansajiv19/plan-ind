import type { ReactNode } from "react";

/**
 * The three places in the current round, or the three finalists. On a phone
 * this is a snap carousel (see .vote-options-grid); callers key it per round
 * so the next set animates in rather than swapping in place.
 *
 * Presentational only: the caller owns the tally and passes each card in
 * through `renderCard`. Shared by the live vote page and /demo/vote.
 */
export default function VoteOptionsGrid<S extends { id: string }>({
  spots,
  leaderId,
  winnerId,
  decided,
  folded,
  sawOpenRound,
  roundDir,
  agreement,
  renderCard,
}: {
  spots: readonly S[];
  leaderId: string | null;
  winnerId: string | null;
  decided: boolean;
  /** The round has closed and the losers have finished folding away. */
  folded: boolean;
  /** Only someone who watched the round close sees the losers fold. */
  sawOpenRound: boolean;
  /** 1 enters from the right, -1 from the left. */
  roundDir: number;
  /** §25.2 plan gravity, 0 (even split) to 1 (unanimous). */
  agreement: number;
  renderCard: (spot: S) => ReactNode;
}) {
  return (
    <div
      data-folded={folded ? "1" : undefined}
      style={{ "--round-dir": roundDir, "--c": agreement } as React.CSSProperties}
      // gap-3.5 removed: the gap is gravity's one layout channel now, and a
      // Tailwind utility ties with the stylesheet rule on specificity, so
      // whichever comes later in the cascade silently wins. Owning it in
      // one place is the fix; adding !important would only move the tie.
      className="vote-options-grid vote-round mt-6 grid sm:grid-cols-3"
    >
      {spots
        .filter((spot) => !folded || winnerId === spot.id)
        .map((spot, index) => (
          <div
            key={spot.id}
            className="vote-option-shell"
            data-lead={spot.id === leaderId && !decided ? "1" : undefined}
            data-fold={decided && sawOpenRound && winnerId !== spot.id ? "1" : undefined}
            // --off is a FIXED per-card offset, derived from position rather
            // than from the vote data. It has to be stable: a scatter that
            // re-randomises on every vote would read as jitter instead of
            // convergence, and cards would swap places under a thumb.
            style={{ "--off": `${(index % 3) * 23}px` } as React.CSSProperties}
          >
            {renderCard(spot)}
          </div>
        ))}
    </div>
  );
}
