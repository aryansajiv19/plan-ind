"use client";

import { useEffect } from "react";
import { getSupabase } from "@/lib/supabase";
import { touchPlanSeen } from "@/lib/plan-seen";
import type { Access } from "@/hooks/use-plan-data";

/**
 * P31 (074): once this member is on the plan, and again at every stage the
 * page shows (Realtime included), mark it seen so the /home rail stops
 * listing it as changed. A failed touch only leaves the rail's "changed" on,
 * which the next visit clears: nothing on this page depends on it.
 */
export function usePlanSeen(id: string, access: Access, stage: string | undefined) {
  useEffect(() => {
    if (access !== "ready" || !stage) return;
    void touchPlanSeen(getSupabase(), id);
  }, [id, access, stage]);
}
