"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import type { Ranked } from "@/lib/ranking";
import type { MyRankingRow, PlaceRanking, RankingBucket } from "@/lib/types";

export type RankResult = "ranked" | "not_visited" | "bad_neighbours" | "failed";
export type LogVisitResult = "logged" | "limited" | "not_found" | "bad_date" | "failed";

/**
 * Your Beli-style list (085): read it, rank or move a place (the client runs
 * the "this or that" taps with lib/ranking.ts and sends the neighbours), take
 * one out, and log "I went here". A failed read is "failed", never an empty
 * list; a refusal comes back as the server's own reason.
 */
export function useRanking(enabled: boolean) {
  const [rows, setRows] = useState<MyRankingRow[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "failed">("idle");

  const refresh = useCallback(async () => {
    setStatus((current) => (current === "ready" ? current : "loading"));
    const { data, error } = await getSupabase().rpc("my_ranking");
    if (error) {
      setStatus("failed");
      return;
    }
    setRows((data ?? []) as MyRankingRow[]);
    setStatus("ready");
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void getSupabase().rpc("my_ranking").then(({ data, error }) => {
      if (cancelled) return;
      if (error) { setStatus("failed"); return; }
      setRows((data ?? []) as MyRankingRow[]);
      setStatus("ready");
    });
    return () => { cancelled = true; };
  }, [enabled]);

  /** One bucket, best first, in the shape lib/ranking.ts steps through. */
  const bucket = useCallback((which: RankingBucket): (MyRankingRow & Ranked)[] =>
    rows.filter((row) => row.bucket === which).map((row) => ({ ...row, spotId: row.spot_id })), [rows]);

  const rank = useCallback(async (spotId: string, which: RankingBucket, neighbours: { after: string | null; before: string | null },
    answers?: PlaceRanking["answers"]): Promise<RankResult> => {
    const { data, error } = await getSupabase().rpc("rank_place", {
      p_spot: spotId, p_bucket: which, p_after_spot: neighbours.after, p_before_spot: neighbours.before, p_answers: answers ?? {},
    });
    const result = error ? "failed" : ((data as { result?: RankResult } | null)?.result ?? "failed");
    if (result === "ranked") await refresh();
    return result;
  }, [refresh]);

  const unrank = useCallback(async (spotId: string): Promise<boolean> => {
    const { data, error } = await getSupabase().rpc("unrank_place", { p_spot: spotId });
    const ok = !error && (data as { result?: string } | null)?.result === "unranked";
    if (ok) await refresh();
    return ok;
  }, [refresh]);

  /** "I went here": five a Dubai day. */
  const logVisit = useCallback(async (spotId: string, visitedAt?: string): Promise<LogVisitResult> => {
    const { data, error } = await getSupabase().rpc("log_visit", { p_spot: spotId, p_visited_at: visitedAt ?? null });
    return error ? "failed" : ((data as { result?: LogVisitResult } | null)?.result ?? "failed");
  }, []);

  return { rows, status, refresh, bucket, rank, unrank, logVisit };
}
