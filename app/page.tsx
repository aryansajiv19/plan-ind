import { redirect } from "next/navigation";
import HomeExperience from "@/components/HomeExperience";
import { getCurrentUser } from "@/lib/auth";
import { curatedCounts, curatedWall } from "@/lib/spots/catalogue";
import type { Spot } from "@/lib/types";
import { WALL_POOL, WALL_SIZE } from "@/lib/home-views";
import { greetingFor, pickRightNow } from "@/lib/right-now";

// The front door: the pitch, a live sample vote, the composer in its
// sign-in-first state, and the "Dubai, right now" wall, so a visitor sees
// what the product does before being asked for an email. `demoMode` without
// `fixtures`: the account tabs link into the labelled /demo instead.
//
// The wall is a BOUNDED DISPLAY SAMPLE (WALL_SIZE picked from WALL_POOL rows),
// not a catalogue read, so PostgREST's silent 1000-row cap never applies. Both reads come from the curated-catalogue cache
// (lib/spots/catalogue.ts): identical for every signed-out visitor, read at
// most hourly, and a failed read is logged there and never cached. The
// counts line then simply doesn't render; it never shows a guessed number.
export default async function IndexPage() {
  const user = await getCurrentUser();
  if (user) redirect("/home");

  const [wall, counts] = await Promise.all([curatedWall(WALL_POOL), curatedCounts()]);
  // P28: picked per request from the hourly-cached pool (open now first, two
  // per category at most), and greeted on the Dubai clock with no addressee.
  const now = new Date();
  const spots = pickRightNow(wall.data ?? [], now, WALL_SIZE) as unknown as Spot[];

  return <HomeExperience name="" greeting={greetingFor(now)} demoMode spots={spots} counts={counts.data} smartSearchAvailable={Boolean(process.env.OPENAI_API_KEY)} />;
}
