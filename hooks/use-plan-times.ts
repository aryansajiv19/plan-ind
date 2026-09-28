"use client";

import { useCallback, useEffect, useState } from "react";
import type { RealtimeSystemPayload } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import { coalesce } from "@/lib/coalesce";

// P21: the plan's "when" poll (073). Options are the 2-4 times the host
// offered; a vote is one seat saying a time works. Loading, failed and empty
// are three different answers (the silent-failure class).
export type TimeOption = { id: string; starts_at: string };
export type TimeVote = { option_id: string; seat_key: string };
export type PlanTimes =
  | { state: "loading" }
  | { state: "failed" }
  | { state: "ready"; options: TimeOption[]; votes: TimeVote[] };

/** `live` subscribes for ticks; otherwise the poll is read once (a decided plan). */
export function usePlanTimes(planId: string, live: boolean) {
  const [times, setTimes] = useState<PlanTimes>({ state: "loading" });
  // True while the live channel is errored, timed out or closed (see use-plan-realtime.ts).
  const [livePaused, setLivePaused] = useState(false);

  const load = useCallback(async () => {
    const supabase = getSupabase();
    const [options, votes] = await Promise.all([
      supabase.from("plan_time_options").select("id, starts_at").eq("plan_id", planId).order("starts_at").limit(4),
      supabase.from("plan_time_votes").select("option_id, seat_key").eq("plan_id", planId).limit(500),
    ]);
    if (options.error || votes.error) {
      // Keep what is on screen if a refetch fails; only a first read says "failed".
      setTimes((current) => (current.state === "ready" ? current : { state: "failed" }));
      return;
    }
    setTimes({ state: "ready", options: options.data as TimeOption[], votes: votes.data as TimeVote[] });
  }, [planId]);

  useEffect(() => {
    if (!live) {
      const frame = requestAnimationFrame(() => void load());
      return () => cancelAnimationFrame(frame);
    }
    const later = coalesce(load);
    let active = true; // removeChannel below reports CLOSED; that is not a pause
    const channel = getSupabase()
      .channel(`plan-times:${planId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "plan_time_votes", filter: `plan_id=eq.${planId}` }, later)
      // Changes flow only after this system ack, not at SUBSCRIBED: catch up again.
      .on("system", {}, (payload: RealtimeSystemPayload) => {
        if (payload.extension === "postgres_changes" && payload.status === "ok") later();
      })
      .subscribe((status) => {
        if (!active) return;
        setLivePaused(status !== "SUBSCRIBED");
        if (status === "SUBSCRIBED") later();
      });
    const onVisible = () => { if (document.visibilityState === "visible") later(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisible);
      later.cancel();
      void getSupabase().removeChannel(channel);
    };
  }, [live, planId, load]);

  /** Tick or untick a time for this seat. Optimistic; null on success, else a message. */
  async function setAvailable(optionId: string, available: boolean, seatKey: string): Promise<string | null> {
    const apply = (on: boolean) => setTimes((current) => current.state !== "ready" ? current : {
      ...current,
      votes: on
        ? [...current.votes.filter((v) => !(v.option_id === optionId && v.seat_key === seatKey)), { option_id: optionId, seat_key: seatKey }]
        : current.votes.filter((v) => !(v.option_id === optionId && v.seat_key === seatKey)),
    });
    apply(available);
    const { error } = await getSupabase().rpc("set_time_availability", { p_plan_id: planId, p_option_id: optionId, p_available: available });
    if (!error) return null;
    apply(!available);
    return error.code === "22023" ? "This plan is decided, so its time is set." : "That didn’t save. Check your connection and try again.";
  }

  return { times, setAvailable, livePaused };
}
