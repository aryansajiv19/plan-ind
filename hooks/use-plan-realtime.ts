"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { getSupabase } from "@/lib/supabase";
import { coalesce } from "@/lib/coalesce";
import type { Plan } from "@/lib/types";
import type { Access } from "@/hooks/use-plan-data";

type Channel = ReturnType<ReturnType<typeof getSupabase>["channel"]>;

export function usePlanRealtime({
  id,
  access,
  deleted,
  left,
  refetchVotes,
  refetchRsvps,
  refetchRatings,
  refetchPlanSpots,
  setPlan,
  setDeleted,
}: {
  id: string;
  access: Access;
  deleted: "self" | "remote" | null;
  left: "open" | "decided" | null;
  refetchVotes: () => Promise<boolean>;
  refetchRsvps: () => Promise<boolean>;
  refetchRatings: () => Promise<boolean>;
  refetchPlanSpots: () => Promise<void>;
  setPlan: Dispatch<SetStateAction<Plan | null>>;
  setDeleted: Dispatch<SetStateAction<"self" | "remote" | null>>;
}) {
  // The live channels, so leaving can close them BEFORE the page moves on:
  // left open, the leaver lingers as "here now" for everyone until their
  // socket reconnects.
  const dataChannelRef = useRef<Channel | null>(null);
  const cancelRefetchesRef = useRef(() => {}); // drops coalesced refetches still waiting on a timer

  // ── Realtime: live votes + live "decided" for everyone ───────────
  //
  // Realtime checks the `plan_id=eq.<id>` filter against the FULL old row for
  // DELETEs (045 made it available), so these events already arrive only for
  // this plan. But the payload's `old` is cut down to the PRIMARY KEY for RLS
  // tables, so `old.plan_id` is never there: a client-side "is this ours?"
  // check on it (f537134) silently dropped every un-vote, RSVP delete and
  // unrate, and other members' tallies went stale. Refetch on every event —
  // coalesced per kind (lib/coalesce.ts) so a burst of N votes costs each
  // subscriber one read, not N. The plans DELETE handler below can check
  // `old.id`, because id IS the key.
  useEffect(() => {
    if (access !== "ready" || deleted || left) return;
    const later = [refetchVotes, refetchRsvps, refetchRatings, refetchPlanSpots].map((run) => coalesce(run));
    const [votesLater, rsvpsLater, ratingsLater, planSpotsLater] = later;
    const channel = getSupabase()
      .channel(`plan:${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "votes", filter: `plan_id=eq.${id}` },
        votesLater,
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "plans", filter: `id=eq.${id}` },
        (payload) => setPlan(payload.new as Plan),
      )
      // The cascade then fires one DELETE per vote/rsvp/rating. Ending here
      // tears the channel down (the effect depends on `deleted`), so that
      // burst never becomes a burst of refetches.
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "plans", filter: `id=eq.${id}` },
        (payload) => { if (payload.old?.id === id) setDeleted((d) => d ?? "remote"); },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rsvps", filter: `plan_id=eq.${id}` },
        rsvpsLater,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ratings", filter: `plan_id=eq.${id}` },
        ratingsLater,
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "plan_spots", filter: `plan_id=eq.${id}` },
        planSpotsLater,
      )
      .subscribe();
    dataChannelRef.current = channel;
    cancelRefetchesRef.current = () => later.forEach((refetch) => refetch.cancel());
    return () => {
      dataChannelRef.current = null;
      later.forEach((refetch) => refetch.cancel());
      getSupabase().removeChannel(channel);
    };
  }, [access, deleted, left, id, refetchVotes, refetchRsvps, refetchRatings, refetchPlanSpots, setPlan, setDeleted]);

  return { dataChannelRef, cancelRefetchesRef };
}

export function usePlanPresence({
  id,
  access,
  voterName,
  left,
}: {
  id: string;
  access: Access;
  voterName: string | null;
  left: "open" | "decided" | null;
}) {
  const [presentNames, setPresentNames] = useState<string[]>([]);
  // Closed by leavePlan before the page moves on; see usePlanRealtime.
  const presenceChannelRef = useRef<Channel | null>(null);

  // ── Who else has this plan open right now ────────────────────────
  // A separate channel from the data subscriptions above: presence depends on
  // the typed name, and folding it in would tear down every postgres_changes
  // listener each time the name resolves.
  //
  // The presence key is a throwaway per-tab id, NOT the participant token
  // hash. Presence keys and payloads are broadcast to every subscriber on the
  // channel, so keying by the token would hand every link visitor the
  // credential the write RPCs authorise against. The payload carries the
  // typed name only — exactly what the vote list already shows publicly.
  useEffect(() => {
    if (access !== "ready" || !voterName || left) return;
    const sessionKey = crypto.randomUUID();
    const channel = getSupabase().channel(`plan:${id}:presence`, {
      config: { private: true, presence: { key: sessionKey } },
    });
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ name?: string }>();
        const names = Object.values(state)
          .flat()
          .map((entry) => entry.name)
          .filter((name): name is string => Boolean(name));
        setPresentNames([...new Set(names)].sort((a, b) => a.localeCompare(b)));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track({ name: voterName });
      });
    presenceChannelRef.current = channel;
    return () => {
      presenceChannelRef.current = null;
      getSupabase().removeChannel(channel);
    };
  }, [access, id, voterName, left]);

  return { presentNames, presenceChannelRef };
}
