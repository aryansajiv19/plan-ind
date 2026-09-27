// Pure tally helpers for the vote page (app/plan/[id]/page.tsx). Display
// only: the tally that actually advances or decides a plan runs server-side
// in execute_plan_command. No imports beyond types, so it tests without env.
import type { PlanSpot, PlanStage, Rating, Rsvp, Vote } from "@/lib/types";
import type { Mine } from "@/lib/my-rows";

type PersonRow = { voter_name: string; participant_token_hash?: string | null; seat_key?: string | null };

/** One seat per person the client can see; `you` marks this account's. */
export type Seat = { key: string; name: string; you: boolean };

/**
 * Names repeat on a plan (F2), so a row's person is its seat_key (069: one
 * per account per plan, whichever device). The participant hash stands in
 * only where seat_key is null (anonymised rows), a name only for presence.
 */
export function seatKey(row: PersonRow): string {
  if (row.seat_key) return `s:${row.seat_key}`;
  return row.participant_token_hash ? `p:${row.participant_token_hash}` : `n:${row.voter_name}`;
}

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

/**
 * The next pool round (1..poolCount) this voter hasn't picked in, searching
 * forward from `after` and wrapping; null when every round has a pick. With
 * `after` = 0 it is the earliest unpicked round.
 */
export function nextUnpickedPool(chosen: ReadonlySet<number>, after: number, poolCount: number): number | null {
  for (let i = 1; i <= poolCount; i++) {
    const pool = ((after + i - 1) % poolCount) + 1;
    if (!chosen.has(pool)) return pool;
  }
  return null;
}

/** What the vote page derives from its rows on every render. Pure. */
export function planView<S extends { id: string }>({
  votes, rsvps, ratings, presentNames, voterName, spots, planSpots, stage, activePool, poolCount, round, winnerId, planOpen, iVotedYes, mine,
}: {
  votes: readonly Vote[];
  rsvps: readonly Rsvp[];
  ratings: readonly Rating[];
  presentNames: readonly string[];
  voterName: string;
  spots: S[];
  planSpots: PlanSpot[];
  stage: PlanStage;
  activePool: number;
  poolCount: number;
  round: Round;
  winnerId: string | null;
  planOpen: boolean;
  iVotedYes: (spotId: string) => boolean;
  mine: Mine;
}) {
  const voterCount = new Set(votes.map(seatKey)).size;
  // Editable only before voting starts; the server enforces the same rule.
  const canEdit = planOpen && stage === "pool" && votes.length === 0;
  // Everyone the client can see on this plan, one seat per person, you first.
  const seats = new Map<string, Seat>();
  const seat = (row: PersonRow, you: boolean) => {
    const key = seatKey(row);
    const known = seats.get(key);
    if (known) known.you ||= you;
    else seats.set(key, { key, name: row.voter_name, you });
  };
  votes.forEach((row) => seat(row, mine.vote(row)));
  rsvps.forEach((row) => seat(row, mine.rsvp(row)));
  ratings.forEach((row) => seat(row, mine.rating(row)));
  // Presence carries only a name: a seat for someone here with no rows yet.
  const named = new Set([...seats.values()].map((s) => s.name));
  presentNames.forEach((name) => { if (!named.has(name) && name !== voterName) seat({ voter_name: name }, false); });
  const you = [...seats.values()].find((s) => s.you) ?? { key: "you", name: voterName, you: true };
  const roster = [you, ...[...seats.values()].filter((s) => !s.you).sort((a, b) => a.name.localeCompare(b.name))];
  // Seat keys that picked in the round on screen (your rows count as your seat).
  const pickedThisRound = new Set(votes.filter((v) => v.value && isInRound(v, round)).map((v) => (mine.vote(v) ? you.key : seatKey(v))));
  const othersHere = presentNames.filter((name) => name !== voterName);
  const winnerSpot = spots.find((s) => s.id === winnerId) ?? null;
  const visibleSpots = visibleSpotsFor(spots, planSpots, stage, activePool);
  const hasCurrentSelection = visibleSpots.some((spot) => iVotedYes(spot.id));
  const countFor = (spotId: string) => yesCount(votes, spotId, round);
  // Leader drives the After Dark sheen; agreement is §25.2 plan gravity,
  // recomputed per Realtime vote event rather than on a frame loop.
  const leaderId = leaderOf(visibleSpots.map((spot) => spot.id), countFor);
  const agreement = agreementOf(visibleSpots.map((spot) => countFor(spot.id)));

  const poolsChosenByMe = new Set(
    votes
      .filter((vote) => mine.vote(vote) && vote.value && (vote.phase ?? "final") === "pool")
      .map((vote) => vote.pool_number),
  );
  const allPoolsChosen = Array.from({ length: poolCount }, (_, index) => index + 1)
    .every((poolNumber) => poolsChosenByMe.has(poolNumber));

  return {
    voterCount, canEdit, roster, pickedThisRound, othersHere, winnerSpot, visibleSpots,
    hasCurrentSelection, countFor, leaderId, agreement, poolsChosenByMe, allPoolsChosen,
  };
}
