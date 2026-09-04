import { notFound } from "next/navigation";
import HomeExperience from "@/components/HomeExperience";

// Dev-only, and stays that way: this is the one surface that renders
// DemoAccountViews, which is invented friends, visits and photos. The public
// front door is `/`, which shows the same hero with fixtures off.
//
// force-dynamic: this route has no dynamic API in its tree, so Next would
// otherwise prerender it once at build time — baking in whatever hour the
// build happened to run for autoGround()'s server-side data-theme stamp
// (app/layout.tsx), corrected only after the fact by ThemeSync. That is
// exactly the sand-to-black flash the server stamp exists to prevent, live
// on the one route meant to *show* the design (SPECS.md §9).
export const dynamic = "force-dynamic";

export default function HomePreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <HomeExperience name="Aryan" demoMode fixtures />;
}
