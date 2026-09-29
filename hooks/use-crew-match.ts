"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import type { CrewMatch, CrewStreak } from "@/lib/types";

export type CrewRead =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; match: CrewMatch; streak: CrewStreak };

/**
 * You and one friend (088): the crew match (0-100 with its parts and the
 * biggest split, or "not_enough" with the signals so far) and the crew
 * streak. `friendId` is their people.id; anyone not in your friendships is
 * refused by the server, which reads as "failed" here, never as a zero.
 */
export function useCrewMatch(friendId: string | null, enabled = true): CrewRead {
  const [read, setRead] = useState<{ friendId: string; value: CrewRead } | null>(null);

  useEffect(() => {
    if (!enabled || !friendId) return;
    let cancelled = false;
    const db = getSupabase();
    void Promise.all([db.rpc("crew_match", { p_friend: friendId }), db.rpc("crew_streak", { p_friend: friendId })])
      .then(([match, streak]) => {
        if (cancelled) return;
        setRead({
          friendId,
          value: match.error || streak.error || !match.data || !streak.data
            ? { status: "failed" }
            : { status: "ready", match: match.data as CrewMatch, streak: streak.data as CrewStreak },
        });
      });
    return () => { cancelled = true; };
  }, [enabled, friendId]);

  return friendId && read?.friendId === friendId ? read.value : { status: "loading" };
}
