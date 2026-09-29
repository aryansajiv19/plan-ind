"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import type { BoardPeriod, BoardScope, LeaderboardRow } from "@/lib/types";

export type BoardRead =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; rows: LeaderboardRow[]; me: LeaderboardRow | null };

/**
 * One leaderboard (086): the top rows plus your own wherever you stand.
 * `key` is the area for an area board and the spot id for a place board.
 * A failed read is "failed", never an empty board. Keyed on its inputs, so
 * switching scope never shows the previous board's rows.
 */
export function useLeaderboard(scope: BoardScope, key: string | null, period: BoardPeriod, limit = 20, enabled = true) {
  const inputs = `${scope}|${key ?? ""}|${period}|${limit}`;
  const [read, setRead] = useState<{ inputs: string; value: BoardRead } | null>(null);

  useEffect(() => {
    if (!enabled || ((scope === "area" || scope === "place") && !key)) return;
    let cancelled = false;
    void getSupabase()
      .rpc("leaderboard", { p_scope: scope, p_key: key, p_period: period, p_limit: limit })
      .then(({ data, error }) => {
        if (cancelled) return;
        const rows = (data ?? []) as LeaderboardRow[];
        setRead({ inputs, value: error ? { status: "failed" } : { status: "ready", rows, me: rows.find((row) => row.is_me) ?? null } });
      });
    return () => { cancelled = true; };
  }, [enabled, inputs, scope, key, period, limit]);

  return read?.inputs === inputs ? read.value : ({ status: "loading" } as const);
}
