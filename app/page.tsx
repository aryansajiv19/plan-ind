import { redirect } from "next/navigation";
import HomeExperience from "@/components/HomeExperience";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Spot } from "@/lib/types";

// The front door. A signed-out visitor used to be redirected straight to
// /login in production, so the first thing a prospect met was an auth form and
// the hero below was reachable only in dev. It renders here instead: the pitch,
// and the composer in its sign-in-first state, so someone can see what the
// product does before being asked for an email.
//
// `demoMode` without `fixtures` is deliberate — the hero's "Tonight in Dubai"
// panel is aria-hidden product illustration, but the account tabs are invented
// people and history and stay behind the dev-only /home-preview.
// The "Dubai, right now" wall rendered its empty state to every visitor,
// because no spots were ever passed — the busiest page in the app permanently
// showing "no places in the catalog yet" against a catalogue of 82.
//
// This is a BOUNDED DISPLAY SAMPLE, not a catalogue read, and the difference
// matters: PhotoWall shows at most 12 tiles (HomeExperience slices to 12), so
// the limit here is the wall's own size rather than an arbitrary cap. That is
// what keeps it clear of the silent-truncation class fixed in migration 040's
// pass — PostgREST caps a table read at 1000 rows with no error, so a query
// that means "all" and takes what it gets is a correctness bug. A query that
// means "twelve" and asks for twelve is not.
//
// Photos first: a photo wall is the surface where real photography earns the
// most, and only a handful of spots have one, so nulls sort last rather than
// leaving the wall to chance. Name is the tiebreak so the render is stable
// between requests instead of reshuffling on every visit.
const WALL_SIZE = 12;

export default async function IndexPage() {
  const user = await getCurrentUser();
  if (user) redirect("/home");

  // Columns: what PhotoTile reads (photo_url, name, area, min_spend, vibe,
  // id) PLUS category and price_band, which CardStackExample needs. That
  // second consumer is easy to miss: passing 12 spots trips its
  // `spots.length >= 9` check, so the hero deck switches from its curated
  // illustrative cards to these rows — and without those two fields every
  // card falls back to the generic chip with a blank price. The `as Spot[]`
  // cast below is what hides that from the type checker, so treat this list
  // as load-bearing rather than cosmetic.
  //
  // photo_attribution comes along because several queued photos are CC-BY:
  // the licence requires credit wherever the image renders, so the data has
  // to be here before PhotoTile can show it. (PhotoTile does not render it
  // yet — that is Frontend's, flagged, and it must land before migration 039
  // puts the first CC images on this page.)
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("spots")
    .select("id, name, area, min_spend, vibe, photo_url, photo_attribution, category, price_band")
    .eq("source", "curated")
    .order("photo_url", { nullsFirst: false })
    .order("name")
    .limit(WALL_SIZE);

  // Never swallow this. An empty wall with a silent error is precisely the
  // failure that hid this bug in the first place -- a read returning zero
  // rows and no complaint, which reads as "no data" rather than "no
  // permission". If the anon policy is ever missing or revoked, this line is
  // the difference between a logged cause and another silent empty state.
  if (error) {
    console.error("Front-door wall query failed", JSON.stringify({ code: error.code, message: error.message }));
  }

  return <HomeExperience name="Dubai" demoMode spots={(data ?? []) as Spot[]} />;
}
