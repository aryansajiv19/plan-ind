import type { Rating, Rsvp, Vote } from "@/lib/types";

/**
 * Which vote, RSVP and rating rows are this account's (review F2). Names are
 * not unique on a plan, so "mine" is by row id, from the my_plan_rows RPC.
 * Null means that RPC is not on this stack yet (or the read failed): a name
 * match stands in, exactly as before it existed.
 */
export type MyRows = {
  voteIds: ReadonlySet<string>;
  rsvpId: string | null;
  ratingId: string | null;
  /** 069: this account's seat on the plan, as every row it writes carries it. */
  seatKey: string | null;
};

export type Mine = {
  vote: (row: Vote) => boolean;
  rsvp: (row: Rsvp) => boolean;
  rating: (row: Rating) => boolean;
};

/** my_plan_rows' payload, or null when it is missing or malformed. */
export function parseMyRows(data: unknown): MyRows | null {
  if (!data || typeof data !== "object") return null;
  const raw = data as { votes?: unknown; rsvp_id?: unknown; rating_id?: unknown; seat_key?: unknown };
  if (!Array.isArray(raw.votes)) return null;
  return {
    voteIds: new Set(raw.votes.map((vote: { id?: unknown }) => vote.id).filter((id): id is string => typeof id === "string")),
    rsvpId: typeof raw.rsvp_id === "string" ? raw.rsvp_id : null,
    ratingId: typeof raw.rating_id === "string" ? raw.rating_id : null,
    seatKey: typeof raw.seat_key === "string" ? raw.seat_key : null,
  };
}

// Optimistic rows are written by this client under a `local-` id, so they are
// always its own, before the server row and its id arrive.
const optimistic = (id: string) => id.startsWith("local-");

export function mineFrom(rows: MyRows | null, voterName: string | null): Mine {
  if (!rows) {
    const byName = (row: { voter_name: string }) => row.voter_name === voterName;
    return { vote: byName, rsvp: byName, rating: byName };
  }
  return {
    vote: (row) => optimistic(row.id) || rows.voteIds.has(row.id),
    rsvp: (row) => optimistic(row.id) || row.id === rows.rsvpId,
    rating: (row) => optimistic(row.id) || row.id === rows.ratingId,
  };
}
