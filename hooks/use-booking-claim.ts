"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { getSupabase } from "@/lib/supabase";
import { bookingOutcome, type BookingAction, type BookingOutcome } from "@/lib/booking-claim";
import type { MyRows } from "@/lib/my-rows";
import type { Plan } from "@/lib/types";

export type BookingClaim = {
  /** The claim is this account's: by account (075), by name before my_plan_rows has it. */
  mine: boolean;
  busy: boolean;
  /** Why the last tap changed nothing, while the booking still stands as it answered. */
  note: BookingOutcome["note"];
  claim: () => void;
  release: () => void;
};

/**
 * 075: any member takes or hands back a decided plan's booking. The server
 * settles races (two taps at once get one "claimed", one "taken"); its answer
 * shows at once, and Realtime brings everyone else's screen along.
 */
export function useBookingClaim({ id, plan, setPlan, voterName, myRows, refetchMine }: {
  id: string;
  plan: Plan | null;
  setPlan: Dispatch<SetStateAction<Plan | null>>;
  voterName: string | null;
  myRows: MyRows | null;
  refetchMine: () => Promise<void>;
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

  async function run(action: BookingAction) {
    setBusy(true);
    const { data, error } = await getSupabase().rpc(action === "claim" ? "claim_booking" : "release_booking", { p_plan_id: id });
    const outcome = bookingOutcome(action, error ? null : data);
    const patch = outcome.patch;
    if (patch) setPlan((current) => current && { ...current, ...patch });
    setAnswer({ note: outcome.note, owner: patch && "booking_owner" in patch ? patch.booking_owner ?? null : owner });
    setBusy(false);
    void refetchMine();
  }

  return {
    mine: myRows ? myRows.myBooking : owner != null && owner === voterName,
    busy,
    note: answer && answer.owner === owner ? answer.note : null,
    claim: () => void run("claim"),
    release: () => void run("release"),
  };
}
