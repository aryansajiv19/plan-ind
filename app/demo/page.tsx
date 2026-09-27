import HomeExperience from "@/components/HomeExperience";
import { curatedWall } from "@/lib/spots/catalogue";
import type { Spot } from "@/lib/types";
import { viewFromParam, WALL_POOL, WALL_SIZE } from "@/lib/home-views";
import { greetingFor, pickRightNow } from "@/lib/right-now";

// The public demo: the account tabs filled with DemoAccountViews' fixtures,
// so someone can see a finished plan, a visit log and a friends list without
// creating an account. Everything here is invented and labelled as such by
// the banner HomeExperience renders whenever `fixtures` is on (house rule 1:
// never show invented data as a signed-in user's own).
//
// force-dynamic: no dynamic API in this tree, so Next would otherwise
// prerender it once at build time — baking in whatever hour the build ran for
// autoGround()'s server-side data-theme stamp (app/layout.tsx), corrected
// only afterwards by ThemeSync. That is the sand-to-black flash the server
// stamp exists to prevent, on the one route meant to show the design
// (SPECS.md §9).
export const dynamic = "force-dynamic";

export default async function DemoPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  // The same bounded, cached catalogue sample as the landing page
  // (app/page.tsx). Without it the wall showed "no places in the catalog".
  const { data } = await curatedWall(WALL_POOL);
  const now = new Date();
  // The landing's tabs link here (?view=been): open that tab on first paint.
  const initialView = viewFromParam((await searchParams).view);
  return <HomeExperience name="Aryan" greeting={greetingFor(now)} demoMode fixtures initialView={initialView} spots={pickRightNow(data ?? [], now, WALL_SIZE) as unknown as Spot[]} smartSearchAvailable={Boolean(process.env.OPENAI_API_KEY)} />;
}
