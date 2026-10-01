"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { keepGuestVotes } from "@/hooks/use-guest-session";

/**
 * Guest-only strip under the vote shell, never blocking: after the first vote
 * it offers "sign in to keep these votes" (the merge token is stored BEFORE the
 * redirect, and a failure leaves the guest where they are with a retry). For
 * an account that just arrived from that prompt it carries the retry when the
 * merge call failed.
 */
export default function GuestBar({ planId, isGuest, voted, mergeFailed, retryMerge, dismissMerge }: {
  planId: string;
  isGuest: boolean;
  voted: boolean;
  mergeFailed: boolean;
  retryMerge: () => void;
  dismissMerge: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function save() {
    setBusy(true);
    setFailed(false);
    if (await keepGuestVotes(planId)) {
      router.push(`/login?next=${encodeURIComponent(`/plan/${planId}`)}`);
      return;
    }
    setBusy(false);
    setFailed(true);
  }

  if (mergeFailed) {
    return (
      <p role="alert" className="vote-state__note mt-3 text-center">
        We couldn’t move your guest votes onto your account yet.{" "}
        <button type="button" onClick={retryMerge} className="font-semibold underline underline-offset-2">Try again</button>
        {" · "}
        <button type="button" onClick={dismissMerge} className="underline underline-offset-2">Skip</button>
      </p>
    );
  }
  if (!isGuest || !voted) return null;
  return (
    <p className="vote-state__note mt-3 text-center" role={failed ? "alert" : undefined}>
      {failed ? "We couldn’t start that. Your votes are safe here. " : "Voting as a guest. "}
      <button type="button" onClick={save} disabled={busy} className="font-semibold underline underline-offset-2">
        {busy ? "One moment…" : failed ? "Try again" : "Save your votes: sign in"}
      </button>
    </p>
  );
}
