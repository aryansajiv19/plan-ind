import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Plan } from "./types";

// The home rail's extras (UX #8), read on the server for the <= 8 rail plans:
// the winner's name and area on decided plans, and whether this seat still
// has a pick to make on open ones. No SQL: my_plan_rail stays as it is, and
// two bounded reads answer through the same RLS as the plan page.

type RailPlan = Pick<Plan, "id" | "status" | "stage" | "winner_spot_id">;
export interface RailVote { plan_id: string; phase: string | null; pool_number: number | null; value: boolean }
export interface RailExtras { winner?: { name: string; area: string }; voteNeeded?: boolean }

/** seat_key (069): md5(plan_id:user_id), readable by members while user_id stays hidden. */
export const seatKeyFor = (planId: string, userId: string) => createHash("md5").update(`${planId}:${userId}`).digest("hex");

/**
 * The plan page's own rule (lib/tally.ts allPoolsChosen): in the pools, a
 * yes-pick in every pool; in the final, a yes-pick in the final.
 */
export function voteNeeded(plan: Pick<Plan, "status" | "stage">, poolCount: number, mine: RailVote[]): boolean {
  if (plan.status !== "open") return false;
  const picks = mine.filter((vote) => vote.value);
  if (plan.stage === "final") return !picks.some((vote) => (vote.phase ?? "final") === "final");
  const pools = new Set(picks.filter((vote) => vote.phase === "pool").map((vote) => vote.pool_number));
  return Array.from({ length: poolCount }, (_, i) => i + 1).some((pool) => !pools.has(pool));
}

/** Extras per plan id. A failed read leaves its part out: no claim either way. */
export async function readRailExtras(db: SupabaseClient, plans: RailPlan[], userId: string): Promise<Record<string, RailExtras>> {
  const winnerIds = [...new Set(plans.filter((p) => p.status === "decided" && p.winner_spot_id).map((p) => p.winner_spot_id!))];
  const open = plans.filter((p) => p.status === "open");
  const openIds = open.map((p) => p.id);
  const [winners, pools, votes] = await Promise.all([
    winnerIds.length ? db.from("spots").select("id, name, area").in("id", winnerIds) : null,
    openIds.length ? db.from("plans").select("id, pool_count").in("id", openIds) : null,
    openIds.length
      ? db.from("votes").select("plan_id, phase, pool_number, value").in("plan_id", openIds).in("seat_key", openIds.map((id) => seatKeyFor(id, userId)))
      : null,
  ]);
  const out: Record<string, RailExtras> = {};
  if (winners && !winners.error) {
    const byId = new Map((winners.data ?? []).map((s) => [s.id as string, { name: s.name as string, area: s.area as string }]));
    for (const plan of plans) if (plan.winner_spot_id && byId.has(plan.winner_spot_id)) out[plan.id] = { winner: byId.get(plan.winner_spot_id) };
  }
  if (pools && !pools.error && votes && !votes.error) {
    const poolCount = new Map((pools.data ?? []).map((p) => [p.id as string, Number(p.pool_count)]));
    for (const plan of open) {
      if (!poolCount.has(plan.id)) continue;
      const mine = (votes.data ?? []).filter((v) => v.plan_id === plan.id) as RailVote[];
      out[plan.id] = { ...out[plan.id], voteNeeded: voteNeeded(plan, poolCount.get(plan.id)!, mine) };
    }
  }
  return out;
}
