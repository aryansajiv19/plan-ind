// Row shapes for our four tables. Kept hand-written (small schema, no
// generated types yet) so the data model reads at a glance.

export type PriceBand = "$" | "$$" | "$$$";
export type PlanStatus = "open" | "decided";

// A "spot" is any hangout place, of any category. Kept table name `spots`
// internally; `category` is what makes it multi-type.
export interface Spot {
  id: string;
  name: string;
  category: string; // "dinner" | "cafe" | "shisha" | "movie" | ... (curated)
  area: string;
  cuisine: string; // for non-food categories: a short type label ("cinema", "arcade")
  price_band: PriceBand;
  min_spend: number; // AED per person
  open_till: string; // e.g. "12am", "3am"
  vibe: string;
  photo_url: string | null; // curated now; a places API can fill this later
  description: string | null; // a review blurb to help people decide
  booking_url: string | null;
}

export interface Plan {
  id: string; // uuid — this is the share-link slug
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
}

export interface PlanSpot {
  plan_id: string;
  spot_id: string;
}

export interface Vote {
  id: string;
  plan_id: string;
  spot_id: string;
  voter_name: string;
  value: boolean; // true = yes
}

// After the decision: who's actually coming. A vote is an opinion; an RSVP
// is a commitment. Headcount (not vote count) drives the booking.
export interface Rsvp {
  id: string;
  plan_id: string;
  voter_name: string;
  coming: boolean;
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
}
