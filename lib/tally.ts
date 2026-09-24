// Pure tally helpers for the vote page (app/plan/[id]/page.tsx). Display
// only: the tally that actually advances or decides a plan runs server-side
// in execute_plan_command. No imports beyond types, so it tests without env.
import type { PlanSpot, PlanStage, Vote } from "@/lib/types";

export type Round = { phase: "pool" | "final"; poolNumber: number };

/** The round a voter is looking at: a pool round by number, else the final (pool 0). */
export function roundFor(stage: PlanStage, activePool: number): Round {
  return stage === "pool" ? { phase: "pool", poolNumber: activePool } : { phase: "final", poolNumber: 0 };
}

// Legacy rows can predate phase/pool_number, hence the fallbacks.
export function isInRound(vote: Vote, round: Round): boolean {
  return (vote.phase ?? "final") === round.phase && (vote.pool_number ?? 0) === round.poolNumber;
}

export function yesCount(votes: readonly Vote[], spotId: string, round: Round): number {
  return votes.filter((v) => v.spot_id === spotId && v.value && isInRound(v, round)).length;
}

// Sorted so a re-render never reshuffles the faces; only genuinely new
// names should move, and OptionCard decides that by diffing this list.
export function votersFor(votes: readonly Vote[], spotId: string, round: Round): string[] {
  return votes
    .filter((v) => v.spot_id === spotId && v.value && isInRound(v, round))
    .map((v) => v.voter_name)
    .sort((a, b) => a.localeCompare(b));
}

/** The spots on screen: this pool's three, the advanced finalists, or all of them. */
export function visibleSpotsFor<S extends { id: string }>(
  spots: readonly S[],
  planSpots: readonly PlanSpot[],
  stage: PlanStage,
  activePool: number,
): S[] {
  if (stage === "pool") {
    return spots.filter((spot) => planSpots.some(
      (link) => link.spot_id === spot.id && (link.pool_number ?? 1) === activePool,
    ));
  }
  const advancedIds = planSpots.filter((link) => link.advanced).map((link) => link.spot_id);
  return advancedIds.length > 0 ? spots.filter((spot) => advancedIds.includes(spot.id)) : [...spots];
}

// The card the room is converging on. A tie has no leader on purpose:
// sheening two cards would read as "both winning", which is the opposite of
// what a reveal is for. Zero votes has none either.
export function leaderOf(spotIds: readonly string[], countFor: (spotId: string) => number): string | null {
  const top = Math.max(0, ...spotIds.map(countFor));
  if (top === 0) return null;
  const leaders = spotIds.filter((spotId) => countFor(spotId) === top);
  return leaders.length === 1 ? leaders[0] : null;
}

// SPECS.md §25.2 — plan gravity: an even split reads 0, unanimity reads 1.
export function agreementOf(counts: readonly number[]): number {
  const total = counts.reduce((sum, n) => sum + n, 0);
  const n = counts.length;
  // No votes yet, or a single option: nothing has converged, so scatter is
  // at full width. Guarding n <= 1 also keeps the 1/n term from dividing by
  // zero when a round somehow renders one card.
  if (total === 0 || n <= 1) return 0;
  const share = Math.max(...counts) / total;
  return Math.min(1, Math.max(0, (share - 1 / n) / (1 - 1 / n)));
}
