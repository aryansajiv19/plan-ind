// Row shapes for our tables. Kept hand-written (small schema, no generated
// types yet) so the data model reads at a glance.
//
// THESE MIRROR supabase/schema.sql EXACTLY. They are hand-synced: if you
// change one, change the other in the same edit.

export type PriceBand = "$" | "$$" | "$$$";
export type PlanStatus = "open" | "decided";
export type PlanStage = "pool" | "final" | "decided";
export type SpotSource = "curated" | "custom";
export type SpotVisibility = "private" | "friends" | "community";
export type PhotoSource = "venue_site" | "wikimedia" | "stock";

// A "spot" is any hangout place, of any category. Kept table name `spots`
// internally; `category` is what makes it multi-type.
export interface Spot {
  id: string;
  name: string;
  category: string; // "dinner" | "cafe" | "shisha" | "movie" | ... (curated)
  minimum_age: number;
  area: string;
  cuisine: string; // for non-food categories: a short type label ("cinema", "arcade")
  price_band: PriceBand | null; // 089: null = unknown (no made-up bands)
  min_spend: number; // AED per person
  open_till: string; // e.g. "12am", "3am"
  vibe: string;
  photo_url: string | null; // curated now; a places API can fill this later
  // 038. Not interchangeable claims: "venue_site" IS this venue, "wikimedia"
  // usually is, "stock" is NOT -- it only looks like one.
  photo_source: PhotoSource | null;
  // A licence obligation, not metadata. Anything rendering photo_url must
  // render this beside it when non-null, or a CC image is used in breach.
  photo_attribution: string | null;
  description: string | null; // a review blurb to help people decide
  booking_url: string | null;
  // 070: sourced venue facts (scripts/gen-catalogue-truth.mjs). Curated rows only;
  // unknown is null. reopens_on: closed until that Dubai date.
  reopens_on?: string | null;
  phone?: string | null;
  website?: string | null;
  licensed?: boolean | null;
  dress_code?: string | null;
  parking?: string | null;
  reservations?: string | null;
  halal_friendly?: boolean | null;
  vegetarian_options?: boolean | null;
  spend_pp_aed?: string | null;
  good_to_know?: string | null;
  nearest_station?: string | null;
  station_line?: string | null;
  station_walk_min?: number | null;
  facts_checked_on?: string | null;
  facts_sources?: { fact: string; url: string }[] | null;
  source: SpotSource;
  visibility: SpotVisibility;
  /** 051: withheld from client SELECT, so always undefined in the browser.
   *  Owner checks go through my_custom_spots(), never a compare on this. */
  created_by_user_id?: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  /** 063: Google Places id, curated spots only. The ONLY Places field we
   *  store (terms). Build a Maps link with lib/places/maps-url.ts; a
   *  Google photo fallback comes from GET /api/spots/{id}/photo. Optional
   *  because most reads select explicit columns and omit it. */
  google_place_id?: string | null;
  /** 063: when google_place_id was last confirmed against Google. */
  places_synced_at?: string | null;
}

export interface Plan {
  id: string; // uuid — this is the share-link slug
  /** 051: withheld from client SELECT, so always undefined in the browser.
   *  Owner checks go through count_my_hosted_plans() / the host token. */
  created_by_user_id?: string | null;
  title: string;
  category: string; // the hangout type chosen for this plan
  area: string | null;
  deadline: string | null; // ISO timestamp — when voting closes
  status: PlanStatus;
  winner_spot_id: string | null;
  // ── the last mile: turning a decision into a real event ──
  event_time: string | null; // ISO timestamp — when the outing actually is
  booking_owner: string | null; // voter_name of whoever's booking
  booked: boolean;
  /** 057: set when the host reopens a decided plan. Show "reopened" only when
   *  status is "open" and this is set; it stays as history after a re-decide. */
  reopened_at?: string | null;
  decided_at?: string | null; // 069: when status became decided
  stage_changed_at?: string; // 074: when stage last changed (trigger-stamped)
  stage: PlanStage;
  pool_count: number;
  budget_per_person: number | null;
  origin_label: string | null;
  origin_latitude: number | null;
  origin_longitude: number | null;
  radius_km: number | null;
  smart_brief: string | null;
  vibe_preferences: string[];
  avoid_preferences: string[];
  intelligence_model: string | null;
  created_at: string; // ISO timestamp
}
// NOTE: the host token hash is deliberately absent. It lives in
// `plan_host_tokens`, which has no select policy, so it never reaches a
// client — see supabase/migration-019-secret-isolation-and-rpc-integrity.sql.

export interface PlanSpot {
  plan_id: string;
  spot_id: string;
  pool_number: number;
  advanced: boolean;
}

export interface Vote {
  id: string;
  plan_id: string;
  spot_id: string;
  voter_name: string;
  value: boolean; // true = yes
  phase: "pool" | "final";
  pool_number: number;
  participant_token_hash?: string | null;
  seat_key?: string | null; // 069: one per account per plan (md5 of plan + user)
  /** 043: the auth uid that actually wrote this row. The hash above is an
   *  identity marker, NOT a credential -- the RPCs check this, not it. */
  user_id?: string | null;
}

// What cast_plan_vote returns (migration 023). The vote is idempotent per
// (plan, participant, round): a replayed call returns this unchanged.
// spot_id is the participant's current pick for the round, or null once cleared.
export interface CastVoteResult {
  plan_id: string;
  phase: "pool" | "final";
  pool_number: number;
  spot_id: string | null;
}

// What plan_share_preview returns (migration 062), or null for an unknown or
// deleted plan. The only plan data a sessionless link crawler can read.
export interface PlanSharePreview {
  title: string;
  status: PlanStatus;
  stage: PlanStage;
  deadline: string | null;
  host_first_name: string | null;
  spot_count: number;
  event_time: string | null;
  /** The winning spot, only when status is 'decided'; null otherwise. */
  winner_name: string | null;
  winner_area: string | null;
}

// After the decision: who's actually coming. A vote is an opinion; an RSVP
// is a commitment. Headcount (not vote count) drives the booking.
export interface Rsvp {
  id: string;
  plan_id: string;
  voter_name: string;
  coming: boolean;
  choice?: "coming" | "maybe" | "no";
  participant_token_hash?: string | null;
  seat_key?: string | null; // 069: one per account per plan (md5 of plan + user)
  /** 043: the auth uid that actually wrote this row. The hash above is an
   *  identity marker, NOT a credential -- the RPCs check this, not it. */
  user_id?: string | null;
  // Carpool coordination (migration 035) -- a list, not a matcher.
  // seats_available is only meaningful when transport === "driving".
  transport?: "driving" | "need_ride" | "own_way" | null;
  seats_available?: number | null;
}

// After the visit: how was it? Closes the loop and (later) feeds "haven't
// been yet" + smarter suggestions. One per (plan, voter).
export interface Rating {
  id: string;
  plan_id: string;
  spot_id: string;
  voter_name: string;
  stars: number; // 1–5
  again: boolean; // would you go again?
  participant_token_hash?: string | null;
  seat_key?: string | null; // 069: one per account per plan (md5 of plan + user)
  /** 043: the auth uid that actually wrote this row. The hash above is an
   *  identity marker, NOT a credential -- the RPCs check this, not it. */
  user_id?: string | null;
}

// ─── The social layer ──────────────────────────────────────────────
// Authenticated profile. The browser caches the public card in localStorage,
// while Supabase Auth and `auth_user_id` own identity. This does NOT replace
// `voter_name`: shared-plan votes/rsvps/ratings remain keyed by a free-typed
// name, so public plan links and plans in flight are unaffected.

export interface Person {
  // READ-ONLY to clients. A DB trigger (people_before_write) pins `id` and
  // `auth_user_id` on any anon/authenticated write, because RLS is
  // row-level and `update people using (true)` would otherwise expose them.
  id: string; // uuid — minted on the device, and the profile-link slug
  display_name: string; // 1–40 chars, TRIMMED on write by the DB
  emoji: string | null; // null = not chosen (052); else 1–8 chars, no controls or bidi overrides
  color: string; // "#rrggbb" — validated by the DB, LOWERCASED on write
  auth_user_id: string | null; // auth.users.id for signed-in profiles; null on legacy rows
  hide_from_boards?: boolean; // 086 (staged): off the public leaderboards (friends and yourself still see you)
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
}

// Friendship is SYMMETRIC and stored as two directed rows (a→b and b→a),
// mirrored by a DB trigger. Write ONE row and let the trigger create the
// other; never write both yourself.
export interface Friendship {
  person_id: string;
  friend_id: string;
  created_at: string;
}

// "I went to this place." Stands alone, or originates from a decided plan.
// NOTE: `visits` has no UPDATE policy on purpose, so a visit is never
// edited in place — logVisit() replaces the row. A re-logged plan visit
// therefore gets a NEW `id` and `created_at`. Don't cache a visit id
// across a re-log.
export interface Visit {
  id: string;
  person_id: string; // whose log this is
  spot_id: string;
  plan_id: string | null; // set when it came from a decided plan; null if logged by hand
  visited_at: string; // ISO timestamp
  group_label: string | null; // 1–40 chars; trimmed on write, blank becomes null
  note: string | null; // up to 280 chars; trimmed on write, blank becomes null
  created_at: string;
}

// Exactly one of `person_id` / `companion_name` is set, enforced by a CHECK.
//   person_id set    → a tagged profile (name comes live from `people`)
//   companion_name   → a free-typed name, for companions with no profile
// `companion_name` is trimmed on write and unique per visit
// case-insensitively, so "Sara" / "sara" / "Sara " are one companion.
// Display casing is preserved as typed.
export interface VisitCompanion {
  id: string;
  visit_id: string;
  person_id: string | null;
  companion_name: string | null;
  created_at: string;
}

export interface VisitCollection {
  id: string;
  person_id: string;
  name: string;
  folder_id?: string | null; // 081 (staged)
  created_at: string;
}

export interface VisitCollectionItem {
  collection_id: string;
  visit_id: string;
  created_at: string;
}

export interface VisitPhoto {
  id: string;
  visit_id: string;
  person_id: string;
  storage_path: string;
  caption: string | null;
  visibility: SpotVisibility;
  created_at: string;
}

// Discover moodboards (migration 036, design-system/SPECS.md §15.3). Same
// free-form user-named-collection shape as VisitCollection, not
// PlaceCollection's fixed-default-pair model.
export interface Moodboard {
  id: string;
  person_id: string;
  name: string;
  theme: string | null;
  visibility: "private" | "friends" | "shared";
  folder_id?: string | null; // 081 (staged)
  created_at: string;
}

export interface MoodboardItem {
  id: string;
  moodboard_id: string;
  kind: "place" | "link" | "photo";
  label: string;
  note: string | null;
  // Image bytes live in Storage, same pattern as VisitPhoto.storage_path.
  storage_path: string | null;
  source_url: string | null;
  created_at: string;
}

export interface PlaceCollection {
  id: string;
  person_id: string;
  name: string;
  kind: "want_to_try" | "planning" | "custom";
  folder_id?: string | null; // 081 (staged)
  created_at: string;
}

// 081 (staged): a private folder grouping an account's lists. Same owner as
// the lists it holds (composite FK); deleting one un-files them.
export interface Folder {
  id: string;
  person_id: string;
  name: string;
  emoji: string;
  created_at: string;
}

// 085 (staged): one place in a person's Beli-style ranking. Private (owner-only
// read); written only by rank_place / unrank_place, which rescore the bucket.
export type RankingBucket = "loved" | "fine" | "meh";
export interface PlaceRanking {
  person_id: string;
  spot_id: string;
  bucket: RankingBucket;
  position: number; // 1 = best in the bucket
  score: number; // 0-10: loved 7-10, fine 4-7, meh 0-4
  answers: { vibe?: string; value?: "great" | "fair" | "pricey"; again?: boolean };
  created_at: string;
  updated_at: string;
}

/** my_ranking(): a place in your list, best first, with what a row shows. */
export interface MyRankingRow {
  spot_id: string;
  bucket: RankingBucket;
  position: number;
  score: number;
  answers: PlaceRanking["answers"];
  updated_at: string;
  name: string;
  area: string;
  category: string;
  photo_url: string | null;
  photo_attribution: string | null;
  google_place_id: string | null;
}

// 086 (staged): leaderboard(scope, key, period, limit). No ids: player_key is
// an opaque stable hash, label is first name + last initial.
export type BoardScope = "dubai" | "area" | "place" | "friends";
export type BoardPeriod = "month" | "all";
export interface LeaderboardRow {
  rank: number | null; // null only on your own row before you have points
  player_key: string;
  label: string;
  emoji: string | null;
  points: number | null; // null on a place board, which ranks by score
  band: RankingBucket | null; // a place board's ranking band
  is_me: boolean;
}

// 085: community scores. The mean of members' scores, only at 5+ raters,
// with the count as a band so one person's score can't be backed out.
export type RatersBand = "5+" | "10+" | "20+" | "50+";
export interface PlaceScore {
  spot_id: string;
  score: number;
  raters: RatersBand;
}
/** top_places(area?, limit): the best-scored curated places. */
export interface TopPlace extends PlaceScore {
  name: string;
  area: string;
  category: string;
  photo_url: string | null;
  photo_attribution: string | null;
  google_place_id: string | null;
}

// 088 (staged): crew match and streak with one friend. Aggregates only.
export type CategoryGroupKey = "food" | "night" | "water" | "active" | "leisure";
export type CrewMatch =
  | { status: "not_enough"; signals: number; needed: number }
  | {
      status: "ready";
      score: number; // 0-100
      parts: {
        plans: { agreement: number; rounds: number } | null; // same place picked, per shared round
        rankings: { agreement: number } | null; // same bucket, at 5+ places both ranked; a once-a-day snapshot
        categories: { overlap: number; shared: number } | null; // kinds of place both have been to
      };
      biggest_split: CategoryGroupKey | null; // where our plan votes agree least (3+ rounds, under 60%)
      signals: number; // shared plan rounds + shared kinds of place (never rankings)
    };
export interface CrewStreak {
  months: number; // consecutive Dubai months with a decided plan both have a visit from
  since: string | null; // "YYYY-MM"
  this_month_open: boolean; // this month hasn't counted yet: a nudge
}

export interface PlaceImport {
  id: string;
  person_id: string;
  source_url: string;
  normalized_url: string;
  provider: "instagram" | "tiktok" | "facebook" | "reddit" | "youtube" | "web";
  status: "pending" | "resolving" | "resolved" | "needs_input" | "failed";
  resolved_spot_id: string | null;
  extracted_data: Record<string, unknown>;
  error_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlaceCollectionItem {
  id: string;
  collection_id: string;
  spot_id: string | null;
  import_id: string | null;
  note: string | null;
  created_at: string;
}

// ─── Read shapes (what the queries in lib/social.ts return) ────────
// Not tables — these are the joined shapes the UI codes against.

// The public face of a person: everything except the auth seam.
export type PersonCard = Pick<
  Person,
  "id" | "display_name" | "emoji" | "color"
>;

// A companion resolved for display. `person` is non-null when the companion
// has a profile (tap through to it); otherwise fall back to `name`.
export interface CompanionView {
  id: string; // visit_companions.id — React key, and the arg to untagCompanion()
  person: PersonCard | null;
  name: string; // always renderable: the profile's display_name, or the typed name
}

// One row of a profile feed. `spot` is non-null in practice (the FK is NOT
// NULL) but stays nullable so a failed embed degrades instead of crashing.
export interface ProfileVisit extends Visit {
  spot: Spot | null;
  companions: CompanionView[];
}

// A signed-in account's persisted monthly recap. Ratings are deliberately
// represented as a group average: ratings are tied to typed plan participants,
// not to the authenticated account that is viewing this summary.
export interface WrappedSummary {
  periodLabel: string;
  planCount: number;
  /** Visits logged by this account during the period. */
  activityCount: number;
  topArea: string | null;
  topGroup: string | null;
  topCategory: string | null;
  bestRatedPlace: {
    name: string;
    average: number;
    ratingCount: number;
  } | null;
}

export type WrappedSummaryError = "plans" | "visits" | "ratings";

export type WrappedSummaryResult =
  | { data: WrappedSummary; error: null }
  | { data: null; error: WrappedSummaryError };

// 073: "When" -- the host's time options and members' availability ticks.
// plan_time_votes carries no user id (Realtime sends whole rows): seat_key is
// the member (069), and my_plan_rows returns the caller's own.
export interface PlanTimeOption {
  id: string;
  plan_id: string;
  starts_at: string;
  created_at: string;
}

export interface PlanTimeVote {
  option_id: string;
  plan_id: string;
  seat_key: string;
  created_at: string;
}

// 098: guest voting. guest_sessions is server-only (no select policy); these
// are the answers of its RPCs. A refusal is a status, never an error code.
export type GuestJoinStatus =
  | "joined" | "already"
  | "full" | "age_gated" | "other_plan" | "expired" | "merged" | "removed";

export interface GuestJoinResult {
  status: GuestJoinStatus;
  name?: string;
}

// merge_guest_into_me. "gone": the plan no longer exists.
export type GuestMergeStatus = "merged" | "already" | "linked" | "gone";

export interface GuestMergeResult {
  status: GuestMergeStatus;
  plan_id: string;
  votes_moved?: number;
  rsvps_moved?: number;
}
