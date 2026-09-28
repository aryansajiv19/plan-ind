"use client";

import { useCallback } from "react";
import { getSupabase } from "@/lib/supabase";

const REFUSED: Record<string, string> = {
  not_host: "Only the host can remove people from this plan.",
  not_member: "They’ve already left this plan.",
  cannot_remove_host: "You can’t remove yourself; delete the plan instead.",
  not_found: "This plan no longer exists.",
};

/**
 * 080: the host removes a member by seat key (user ids stay hidden). The
 * server re-checks that the caller is the host. On success the member's
 * rows are gone, so the reads are refreshed; Realtime brings everyone else.
 */
export function useRemoveMember({ id, setNotice, refetchVotes, refetchRsvps }: {
  id: string;
  setNotice: (notice: string | null) => void;
  refetchVotes: () => unknown;
  refetchRsvps: () => unknown;
}) {
  return useCallback(async (seatKey: string, name: string) => {
    // No un-remove exists (080), so a stray tap must not be final.
    if (!window.confirm(`Remove ${name} from this plan? They won’t be able to rejoin.`)) return;
    const { data, error } = await getSupabase().rpc("remove_plan_member", { p_plan_id: id, p_seat_key: seatKey });
    const result = error ? null : (data as { result?: string } | null)?.result;
    if (result === "removed") {
      void refetchVotes();
      void refetchRsvps();
      return;
    }
    setNotice((result && REFUSED[result]) ?? "That person couldn’t be removed. Try again in a moment.");
  }, [id, setNotice, refetchVotes, refetchRsvps]);
}
