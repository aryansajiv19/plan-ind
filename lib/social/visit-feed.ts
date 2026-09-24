// Reading the visit log: a person's visits with spot and companions resolved.

import type { CompanionView, PersonCard, ProfileVisit, Spot } from "../types";
import { getSupabase } from "../supabase";
import { PERSON_FIELDS, type Db, type ListRead } from "./shared";

const VISIT_SELECT = `
  id, person_id, spot_id, plan_id, visited_at, group_label, note, created_at,
  spot:spots(id,name,category,area,cuisine,price_band,min_spend,open_till,vibe,photo_url,photo_attribution,description,minimum_age,address,latitude,longitude),
  companions:visit_companions(id, person_id, companion_name, created_at,
    person:people(${PERSON_FIELDS}))
`;

interface RawCompanion {
  id: string;
  person_id: string | null;
  companion_name: string | null;
  created_at: string;
  person: PersonCard | null;
}

interface RawVisit {
  id: string;
  person_id: string;
  spot_id: string;
  plan_id: string | null;
  visited_at: string;
  group_label: string | null;
  note: string | null;
  created_at: string;
  spot: Spot | null;
  companions: RawCompanion[] | null;
}

// A companion row carries EITHER a person_id or a typed name (DB CHECK).
// Tagged profiles render from the live `people` row, so a rename propagates;
// typed names render as-is. Sorted here rather than server-side so the order
// is deterministic without depending on embedded-order syntax.
function toCompanionViews(rows: RawCompanion[] | null): CompanionView[] {
  return (rows ?? [])
    .map((c) => ({
      id: c.id,
      person: c.person ?? null,
      name: c.person?.display_name ?? c.companion_name ?? "Someone",
      created_at: c.created_at,
    }))
    .sort((a, b) =>
      a.created_at === b.created_at
        ? a.id.localeCompare(b.id)
        : a.created_at.localeCompare(b.created_at),
    )
    .map(({ id, person, name }) => ({ id, person, name }));
}

function toProfileVisit(v: RawVisit): ProfileVisit {
  return {
    id: v.id,
    person_id: v.person_id,
    spot_id: v.spot_id,
    plan_id: v.plan_id,
    visited_at: v.visited_at,
    group_label: v.group_label,
    note: v.note,
    created_at: v.created_at,
    spot: v.spot ?? null,
    companions: toCompanionViews(v.companions),
  };
}

/**
 * The public profile feed: this person's visits, newest first, each with its
 * spot and resolved companions. Ordered by (visited_at desc, id desc) so the
 * sort is total and stable — visited_at alone ties constantly.
 */
export async function getProfileVisits(
  personId: string,
  limit = 50,
  db: Db = getSupabase(),
): Promise<ListRead<ProfileVisit>> {
  const { data, error } = await db
    .from("visits")
    .select(VISIT_SELECT)
    .eq("person_id", personId)
    .order("visited_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (error) return { rows: [], failed: true };
  return { rows: ((data ?? []) as unknown as RawVisit[]).map(toProfileVisit), failed: false };
}
