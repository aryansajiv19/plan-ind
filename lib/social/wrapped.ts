// Wrapped's reads. The pure aggregation lives in lib/wrapped.ts; this is the
// paged, RLS-scoped fetch that feeds it.

import type { WrappedSummaryResult } from "../types";
import { aggregateWrappedSummary, dubaiMonthWindow } from "../wrapped";
import type {
  WrappedMonthWindow,
  WrappedRatingRow,
  WrappedVisitRow,
} from "../wrapped";
import type { Db } from "./shared";

// ─── Wrapped ──────────────────────────────────────────────────────

const WRAPPED_PAGE_SIZE = 500;
const WRAPPED_PLAN_CHUNK_SIZE = 100;

async function readWrappedVisits(
  personId: string,
  period: WrappedMonthWindow,
  db: Db,
): Promise<{ data: WrappedVisitRow[] | null; error: boolean }> {
  const rows: WrappedVisitRow[] = [];
  for (let from = 0; ; from += WRAPPED_PAGE_SIZE) {
    const result = await db
      .from("visits")
      .select("id, plan_id, spot_id, group_label, spot:spots(id, name, area, category)")
      .eq("person_id", personId)
      .gte("visited_at", period.start)
      .lt("visited_at", period.end)
      .order("visited_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + WRAPPED_PAGE_SIZE - 1);
    if (result.error) return { data: null, error: true };

    const page = (result.data ?? []) as unknown as WrappedVisitRow[];
    rows.push(...page);
    if (page.length < WRAPPED_PAGE_SIZE) return { data: rows, error: false };
  }
}

async function readWrappedRatings(
  planIds: string[],
  db: Db,
): Promise<{ data: WrappedRatingRow[] | null; error: boolean }> {
  const rows: WrappedRatingRow[] = [];
  for (let chunkStart = 0; chunkStart < planIds.length; chunkStart += WRAPPED_PLAN_CHUNK_SIZE) {
    const chunk = planIds.slice(chunkStart, chunkStart + WRAPPED_PLAN_CHUNK_SIZE);
    for (let from = 0; ; from += WRAPPED_PAGE_SIZE) {
      const result = await db
        .from("ratings")
        .select("id, plan_id, spot_id, stars")
        .in("plan_id", chunk)
        .order("id", { ascending: true })
        .range(from, from + WRAPPED_PAGE_SIZE - 1);
      if (result.error) return { data: null, error: true };

      const page = (result.data ?? []) as unknown as WrappedRatingRow[];
      rows.push(...page);
      if (page.length < WRAPPED_PAGE_SIZE) break;
    }
  }
  return { data: rows, error: false };
}

/**
 * Reads a complete monthly recap under the current user's RLS. `userId` is
 * the Supabase auth id (plan ownership); `personId` is the authenticated
 * profile id (visit ownership). A partial read never becomes a partial recap.
 */
export async function getWrappedSummary(
  userId: string,
  personId: string,
  db: Db,
  now = new Date(),
): Promise<WrappedSummaryResult> {
  const period = dubaiMonthWindow(now);
  const [plans, visits] = await Promise.all([
    // Via RPC (migration 050): 051 hides plans.created_by_user_id from
    // clients. Counts for auth.uid() -- the same user as `userId` here --
    // over the same [start, end) window the old query used.
    db.rpc("count_my_hosted_plans", { p_from: period.start, p_to: period.end }),
    readWrappedVisits(personId, period, db),
  ]);

  if (plans.error) return { data: null, error: "plans" };
  if (visits.error) return { data: null, error: "visits" };
  const visitRows = visits.data ?? [];
  const planIds = [...new Set(
    visitRows
      .map((visit) => visit.plan_id)
      .filter((id): id is string => id !== null),
  )];

  let ratingRows: WrappedRatingRow[] = [];
  if (planIds.length > 0) {
    const ratings = await readWrappedRatings(planIds, db);
    if (ratings.error) return { data: null, error: "ratings" };
    ratingRows = ratings.data ?? [];
  }

  return {
    data: aggregateWrappedSummary({
      periodLabel: period.periodLabel,
      planCount: Number(plans.data ?? 0),
      visits: visitRows,
      ratings: ratingRows,
    }),
    error: null,
  };
}
