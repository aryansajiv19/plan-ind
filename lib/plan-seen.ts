import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * P31 (074): marks the plan seen by this account, so the /home rail stops
 * listing it as changed. Call on plan load and whenever the page shows a new
 * stage, the viewer's own advance or decide included. "not_member" is an
 * answer (not on this plan), not a failure.
 */
export async function touchPlanSeen(
  supabase: SupabaseClient,
  planId: string,
): Promise<"seen" | "not_member" | "unavailable"> {
  const { data, error } = await supabase.rpc("touch_plan_seen", { p_plan_id: planId });
  if (error) return "unavailable";
  const result = (data as { result?: unknown } | null)?.result;
  return result === "seen" || result === "not_member" ? result : "unavailable";
}
