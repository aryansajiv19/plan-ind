"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { getSupabase } from "@/lib/supabase";
import { bookingOutcome, type BookingAction, type BookingOutcome } from "@/lib/booking-claim";
import type { MyRows } from "@/lib/my-rows";
import type { Plan } from "@/lib/types";

export type BookingClaim = {
  /** The claim is this account's (075, my_plan_rows); false until that has answered. */
  mine: boolean;
  busy: boolean;
  /** Why the last tap changed nothing, while the booking still stands as it answered. */
  note: BookingOutcome["note"];
  claim: () => void;
  release: () => void;
  /** The holder or the host records it booked, or undoes that. */
  mark: () => void;
  unmark: () => void;
};

/**
 * 075: any member takes or hands back a decided plan's booking, and the
 * holder or the host marks it booked. The server settles races (two taps at once get one "claimed", one "taken"); its answer
 * shows at once, and Realtime brings everyone else's screen along.
 */
export function useBookingClaim({ id, plan, setPlan, myRows, refetchMine, refetchPlan }: {
  id: string;
  plan: Plan | null;
  setPlan: Dispatch<SetStateAction<Plan | null>>;
  myRows: MyRows | null;
  refetchMine: () => Promise<void>;
  refetchPlan: () => Promise<boolean>;
}): BookingClaim {
  const owner = plan?.booking_owner ?? null;
  const [busy, setBusy] = useState(false);
  // A note belongs to the booking it answered: once the name moves on (someone
  // released it, say), "Omar got there first" is stale and stops showing.
  const [answer, setAnswer] = useState<{ note: BookingOutcome["note"]; owner: string | null } | null>(null);

  // Someone claimed, released or took it over elsewhere: re-read whether it's ours.
  const seenOwner = useRef(owner);
  useEffect(() => {
    if (seenOwner.current === owner) return;
    seenOwner.current = owner;
    void refetchMine();
  }, [owner, refetchMine]);

  // Leaving the page cancels an RPC still in flight; its answer is dropped.
  const unmounted = useRef(new AbortController());
  useEffect(() => {
    const controller = new AbortController();
    unmounted.current = controller;
    return () => controller.abort();
  }, []);

  async function run(action: BookingAction) {
    const signal = unmounted.current.signal;
    setBusy(true);
    const { data, error } = action === "mark" || action === "unmark"
      ? await getSupabase().rpc("mark_booked", { p_plan_id: id, p_booked: action === "mark" }).abortSignal(signal)
      : await getSupabase().rpc(action === "claim" ? "claim_booking" : "release_booking", { p_plan_id: id }).abortSignal(signal);
    if (signal.aborted) return;
    const outcome = bookingOutcome(action, error ? null : data);
    const patch = outcome.patch;
    if (patch) setPlan((current) => current && { ...current, ...patch });
    setAnswer({ note: outcome.note, owner: patch && "booking_owner" in patch ? patch.booking_owner ?? null : owner });
    setBusy(false);
    // A screen that missed a reopen (or a delete) must not keep the old winner.
    if (outcome.resync) void refetchPlan();
    void refetchMine();
  }

  return {
    // By account only: names repeat on a plan, so until my_plan_rows has
    // answered nobody is shown the holder's controls (review F3).
    mine: myRows?.myBooking ?? false,
    busy,
    note: answer && answer.owner === owner ? answer.note : null,
    claim: () => void run("claim"),
    release: () => void run("release"),
    mark: () => void run("mark"),
    unmark: () => void run("unmark"),
  };
}
