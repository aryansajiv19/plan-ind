"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { getSupabase, readAccount } from "@/lib/supabase";
import { coalesce } from "@/lib/coalesce";
import { secureJsonFetch } from "@/lib/security/csrf-client";
import type { PrefsInput } from "@/lib/gathering";
import type { Access } from "@/hooks/use-plan-data";
import { fitFor } from "@/lib/group-prefs";
import { constraintLine, relaxedNote, toGroupPref } from "@/lib/gathering";
import type { PlanGroupSummary, PlanPreferences, Spot } from "@/lib/types";

const COLUMNS = "plan_id,user_id,voter_name,budget_cap,origin_value,origin_latitude,origin_longitude,vibes,avoid,updated_at";

/**
 * A plan's group answers: one read, then (while the plan is still gathering)
 * one Realtime channel, following use-plan-realtime: every event refetches,
 * coalesced; every (re)subscribe and tab return catches up; the channel is
 * removed on unmount. After the deal the rows only feed the cards' "fits"
 * line, so they are read once and no channel is held.
 *
 * group_summary is read on its own and fails soft: the vote page must keep
 * working (generic reasons) on a stack where the column is not there yet.
 */
export function usePlanPreferences({ id, access, live }: { id: string; access: Access; live: boolean }) {
  const [rows, setRows] = useState<PlanPreferences[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [summary, setSummary] = useState<PlanGroupSummary | null>(null);
  const [userId, setUserId] = useState<string | null>(null); // to find this account's own row
  useEffect(() => {
    let active = true;
    void readAccount().then((account) => { if (active && account !== "unavailable") setUserId(account.user?.id ?? null); });
    return () => { active = false; };
  }, []);

  const refetch = useCallback(async () => {
    const { data, error } = await getSupabase().from("plan_preferences").select(COLUMNS).eq("plan_id", id).order("updated_at");
    if (error || !data) { setFailed(true); return false; }
    setFailed(false);
    setRows(data as PlanPreferences[]);
    return true;
  }, [id]);

  useEffect(() => {
    if (access !== "ready") return;
    let active = true;
    void (async () => {
      if (live) { await refetch(); return; }
      // Dealt: only a plan with a group_summary was dealt from answers, so a
      // classic plan costs this one small read and nothing more.
      const plan = await getSupabase().from("plans").select("group_summary").eq("id", id).maybeSingle();
      const value = plan.error ? null : (plan.data as { group_summary?: PlanGroupSummary | null } | null)?.group_summary ?? null;
      if (!active) return;
      setSummary(value);
      if (value) await refetch();
    })();
    return () => { active = false; };
  }, [access, id, live, refetch]);

  useEffect(() => {
    if (access !== "ready" || !live) return;
    const later = coalesce(refetch);
    let active = true;
    const channel = getSupabase()
      .channel(`prefs:${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "plan_preferences", filter: `plan_id=eq.${id}` }, later)
      .on("system", {}, (payload) => { if (payload.extension === "postgres_changes" && payload.status === "ok") later(); })
      .subscribe((status) => { if (active && status === "SUBSCRIBED") later(); });
    const onVisible = () => { if (document.visibilityState === "visible") later(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisible);
      later.cancel();
      getSupabase().removeChannel(channel);
    };
  }, [access, id, live, refetch]);

  /** Saves this account's answers. Returns a message to show, or null on success. */
  const save = useCallback(async (input: PrefsInput): Promise<string | null> => {
    try {
      const response = await secureJsonFetch(`/api/plans/${id}/preferences`, {
        method: "POST",
        body: JSON.stringify({ budgetCap: input.budgetCap, origin: input.origin ?? "anywhere", vibes: input.vibes, avoid: input.avoid }),
      });
      if (!response.ok) return ((await response.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't save your answers. Try again.";
      await refetch();
      return null;
    } catch {
      return "Couldn't save your answers. Check your connection and try again.";
    }
  }, [id, refetch]);

  // What the vote cards say about the deal: null on a plan that was not dealt from group answers.
  const group = summary && rows ? rows.map(toGroupPref) : null;
  const fit = group && ((spot: Spot) => fitFor(spot, group));
  return { rows, failed, summary, userId, refetch, save, fit, note: summary ? relaxedNote(summary) : null, line: summary ? constraintLine(summary) : null };
}

/**
 * The page that watched a plan sit in 'gathering' has no places loaded. When
 * the stage moves on (this tab's deal, or the host's over Realtime), re-run
 * the plan load once so the nine arrive; without it the vote screen would
 * open cardless. A page opened after the deal never saw 'gathering', so it
 * loads normally and this does nothing. `reload` must be stable.
 */
export function useReloadWhenDealt(stage: string | undefined, reload: () => void) {
  const sawGathering = useRef(false);
  useEffect(() => {
    if (stage === "gathering") { sawGathering.current = true; return; }
    if (!sawGathering.current || !stage) return;
    // Not synchronous: React 19 forbids setState in an effect body.
    const frame = requestAnimationFrame(() => { sawGathering.current = false; reload(); });
    return () => cancelAnimationFrame(frame);
  }, [stage, reload]);
}

/** Everything the plan page needs from group answers, in one call: the data, and the reload once dealt. */
export function usePlanGroup(id: string, access: Access, stage: string | undefined, setReloadKey: Dispatch<SetStateAction<number>>) {
  const prefs = usePlanPreferences({ id, access, live: stage === "gathering" });
  const reload = useCallback(() => setReloadKey((k) => k + 1), [setReloadKey]);
  useReloadWhenDealt(stage, reload);
  return prefs;
}
