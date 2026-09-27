"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { getSupabase } from "@/lib/supabase";
import { haptic } from "@/lib/interaction";
import { isInRound, type Round } from "@/lib/tally";
import type { Spot, Vote } from "@/lib/types";
import type { Mine } from "@/lib/my-rows";

// This voter's pick in the current round: optimistic toggle, the
// cast_plan_vote RPC, and Undo for a cleared pick. The count itself is
// always lib/tally.ts over the server's rows.
export function useVoteActions({
  id,
  votes,
  setVotes,
  voterName,
  participantHash,
  mine,
  decided,
  round,
  spots,
  refetchVotes,
  setNotice,
  reportParticipantFailure,
  onPicked,
}: {
  id: string;
  votes: Vote[];
  setVotes: Dispatch<SetStateAction<Vote[]>>;
  voterName: string | null;
  participantHash: string | null;
  mine: Mine;
  decided: boolean;
  round: Round;
  spots: Spot[];
  refetchVotes: () => Promise<boolean>;
  setNotice: Dispatch<SetStateAction<string | null>>;
  reportParticipantFailure: (error: { code?: string; message?: string } | null, fallback: string) => void;
  /** After a pick (not a clear) saves: the page may move to the next round. */
  onPicked?: (round: Round) => void;
}) {
  const [voteUndo, setVoteUndo] = useState<{ message: string; restore: () => Promise<boolean> } | null>(null);
  const { phase: currentPhase, poolNumber: currentPoolNumber } = round;
  // Your votes are your account's rows (lib/my-rows.ts, F2): one per round,
  // whichever device cast it. Not this device's hash (that hid your vote on a
  // second browser) and not your name (names are not unique on a plan).
  const iVotedYes = (spotId: string) =>
    votes.some((v) => v.spot_id === spotId && mine.vote(v) && v.value && isInRound(v, round));

  // One choice per voter per pool/final. Picking another card replaces it.
  async function toggleVote(spotId: string) {
    if (!voterName || decided) return;
    if (!participantHash) { setNotice("Preparing your private voting session…"); return; }
    const next = !iVotedYes(spotId);
    // Never the only feedback: navigator.vibrate is unsupported on iOS
    // Safari, which is most of this audience. The card's own spring is what
    // actually confirms the pick; this is a bonus where it exists.
    haptic(next ? 10 : 6);

    const isMineThisRound = (v: Vote) =>
      mine.vote(v) &&
      (v.phase ?? "final") === currentPhase &&
      (v.pool_number ?? 0) === currentPoolNumber;
    const before = votes.filter(isMineThisRound);
    setVotes((cur) => {
      const rest = cur.filter((v) => !isMineThisRound(v));
      return next ? [
        ...rest,
        {
          id: `local-${currentPhase}-${currentPoolNumber}-${spotId}-${voterName}`,
          plan_id: id,
          spot_id: spotId,
          voter_name: voterName,
          value: true,
          phase: currentPhase,
          pool_number: currentPoolNumber,
          participant_token_hash: participantHash,
        },
      ] : rest;
    });

    const { error } = await getSupabase().rpc("cast_plan_vote", {
      p_plan_id: id,
      p_spot_id: spotId,
      p_voter_name: voterName,
      p_value: next,
      p_phase: currentPhase,
      p_pool_number: currentPoolNumber,
      p_participant_token_hash: participantHash,
    });
    if (error) {
      // Put back only your own previous pick, at once, then reconcile. A
      // whole-list snapshot restore would discard a Realtime vote from
      // someone else that landed meanwhile; waiting on the reconcile read
      // showed the unsaved pick as saved for ~7s of GET retries.
      setVotes((cur) => [...cur.filter((v) => !isMineThisRound(v)), ...before]);
      reportParticipantFailure(error, "That vote didn't save. Check your connection and tap again.");
      void refetchVotes();
    } else {
      setNotice(null);
      if (next) onPicked?.(round);
      // Clearing your pick is quick and reversible: offer Undo, which re-casts
      // the same pick in the same round (captured here -- toggleVote itself
      // would read a stale tally by the time Undo is tapped).
      if (!next) {
        const phase = currentPhase;
        const pool = currentPoolNumber;
        const hash = participantHash;
        const name = voterName;
        const place = spots.find((spot) => spot.id === spotId)?.name ?? "that place";
        setVoteUndo({
          message: `Cleared your pick of ${place}.`,
          restore: async () => {
            const { error: undoError } = await getSupabase().rpc("cast_plan_vote", {
              p_plan_id: id,
              p_spot_id: spotId,
              p_voter_name: name,
              p_value: true,
              p_phase: phase,
              p_pool_number: pool,
              p_participant_token_hash: hash,
            });
            await refetchVotes();
            return !undoError;
          },
        });
      } else {
        setVoteUndo(null);
      }
    }
  }

  return { iVotedYes, toggleVote, voteUndo, setVoteUndo };
}
