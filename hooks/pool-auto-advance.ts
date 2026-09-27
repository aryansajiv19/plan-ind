import type { Dispatch, SetStateAction } from "react";
import type { Mine } from "@/lib/my-rows";
import { nextUnpickedPool } from "@/lib/tally";
import type { Vote } from "@/lib/types";

// P2: a member other than the host moves through the pool rounds alone.
// After a pick saves, go to the next round they haven't picked in (after a
// beat, so the face lands first), unless they already moved elsewhere.
export function autoAdvanceAfterPick({ isHost, poolCount, votes, mine, setActivePool, setRoundDir }: {
  isHost: boolean;
  poolCount: number;
  votes: readonly Vote[];
  mine: Mine;
  setActivePool: Dispatch<SetStateAction<number>>;
  setRoundDir: Dispatch<SetStateAction<number>>;
}) {
  return (picked: { phase: string; poolNumber: number }) => {
    if (isHost || picked.phase !== "pool") return;
    const chosen = new Set(votes.filter((v) => mine.vote(v) && v.value && v.phase === "pool").map((v) => v.pool_number)).add(picked.poolNumber);
    const next = nextUnpickedPool(chosen, picked.poolNumber, poolCount);
    if (!next) return;
    setTimeout(() => {
      setRoundDir(next > picked.poolNumber ? 1 : -1);
      setActivePool((current) => (current === picked.poolNumber ? next : current));
    }, 700);
  };
}
