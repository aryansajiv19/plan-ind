"use client";

import { useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { getSupabase } from "@/lib/supabase";
import type { Plan } from "@/lib/types";

type Channel = ReturnType<ReturnType<typeof getSupabase>["channel"]>;

export function useLeavePlan({
  id,
  plan,
  setLeft,
  setDeleted,
  setNotice,
  presenceChannelRef,
  dataChannelRef,
  cancelRefetchesRef,
}: {
  id: string;
  plan: Plan | null;
  setLeft: Dispatch<SetStateAction<"open" | "decided" | null>>;
  setDeleted: Dispatch<SetStateAction<"self" | "remote" | null>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
  presenceChannelRef: RefObject<Channel | null>;
  dataChannelRef: RefObject<Channel | null>;
  cancelRefetchesRef: RefObject<() => void>;
}) {
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // C6 (migration 056). Members only -- the host deletes instead.
  async function leavePlan() {
    if (!plan) return;
    const wasDecided = plan.status === "decided";
    setLeaving(true);
    const { data, error } = await getSupabase().rpc("leave_plan", { p_plan_id: id });
    const result = (data as { result?: string } | null)?.result;
    if (error || !result) {
      setLeaving(false);
      setConfirmLeave(false);
      setNotice("Couldn’t leave the plan. Try again.");
      return;
    }
    if (result === "host_cannot_leave") {
      setLeaving(false);
      setConfirmLeave(false);
      setNotice("You started this plan, so you can’t leave it. Delete it instead.");
      return;
    }
    if (result === "not_found") { setDeleted((d) => d ?? "remote"); return; }
    // left, or not_member (already out): close the live channels FIRST --
    // untrack, then remove -- so nobody keeps seeing this person "here now",
    // and no refetch runs against reads that now return nothing.
    const presence = presenceChannelRef.current;
    if (presence) {
      await presence.untrack().catch(() => undefined);
      await getSupabase().removeChannel(presence);
    }
    cancelRefetchesRef.current();
    if (dataChannelRef.current) await getSupabase().removeChannel(dataChannelRef.current);
    // Forget this device's name for the plan, so rejoining starts fresh.
    try { localStorage.removeItem(`voter:${id}`); } catch { /* storage blocked */ }
    setLeft(wasDecided ? "decided" : "open");
  }

  return { confirmLeave, setConfirmLeave, leaving, leavePlan };
}
