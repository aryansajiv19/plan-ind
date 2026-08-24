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

// A "spot" is any hangout place, of any category. Kept table name `spots`
// internally; `category` is what makes it multi-type.
export interface Spot {
  id: string;
  name: string;
  category: string; // "dinner" | "cafe" | "shisha" | "movie" | ... (curated)
  minimum_age: number;
  area: string;
  cuisine: string; // for non-food categories: a short type label ("cinema", "arcade")
  price_band: PriceBand;
  min_spend: number; // AED per person
  open_till: string; // e.g. "12am", "3am"
  vibe: string;
  photo_url: string | null; // curated now; a places API can fill this later
  description: string | null; // a review blurb to help people decide
  booking_url: string | null;
  source: SpotSource;
  visibility: SpotVisibility;
  created_by_user_id: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface Plan {
  id: string; // uuid — this is the share-link slug
  created_by_user_id: string | null;
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
  emoji: string; // 1–8 chars, trimmed; no controls or bidi overrides
  color: string; // "#rrggbb" — validated by the DB, LOWERCASED on write
  auth_user_id: string | null; // auth.users.id for signed-in profiles; null on legacy rows
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

export interface PlaceCollection {
  id: string;
  person_id: string;
  name: string;
  kind: "want_to_try" | "planning" | "custom";
  created_at: string;
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
