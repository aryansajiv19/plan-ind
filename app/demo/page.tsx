import HomeExperience from "@/components/HomeExperience";

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

export default function DemoPage() {
  return <HomeExperience name="Aryan" demoMode fixtures />;
}
