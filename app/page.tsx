import { redirect } from "next/navigation";
import HomeExperience from "@/components/HomeExperience";
import { getCurrentUser } from "@/lib/auth";
import { curatedCounts, curatedWall } from "@/lib/spots/catalogue";
import type { Spot } from "@/lib/types";
import { WALL_SIZE } from "@/lib/home-views";

// The front door: the pitch, a live sample vote, the composer in its
// sign-in-first state, and the "Dubai, right now" wall, so a visitor sees
// what the product does before being asked for an email. `demoMode` without
// `fixtures`: the account tabs link into the labelled /demo instead.
//
// The wall is a BOUNDED DISPLAY SAMPLE (WALL_SIZE rows, photos first, name as
// the stable tiebreak), not a catalogue read, so PostgREST's silent 1000-row
// cap never applies. Both reads come from the curated-catalogue cache
// (lib/spots/catalogue.ts): identical for every signed-out visitor, read at
// most hourly, and a failed read is logged there and never cached. The
// counts line then simply doesn't render; it never shows a guessed number.
export default async function IndexPage() {
  const user = await getCurrentUser();
  if (user) redirect("/home");

  const [wall, counts] = await Promise.all([curatedWall(WALL_SIZE), curatedCounts()]);

  return <HomeExperience name="Dubai" demoMode spots={(wall.data ?? []) as Spot[]} counts={counts.data} />;
}
