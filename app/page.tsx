import { redirect } from "next/navigation";
import HomeExperience from "@/components/HomeExperience";
import { getCurrentUser } from "@/lib/auth";

// The front door. A signed-out visitor used to be redirected straight to
// /login in production, so the first thing a prospect met was an auth form and
// the hero below was reachable only in dev. It renders here instead: the pitch,
// and the composer in its sign-in-first state, so someone can see what the
// product does before being asked for an email.
//
// `demoMode` without `fixtures` is deliberate — the hero's "Tonight in Dubai"
// panel is aria-hidden product illustration, but the account tabs are invented
// people and history and stay behind the dev-only /home-preview.
export default async function IndexPage() {
  const user = await getCurrentUser();
  if (user) redirect("/home");
  return <HomeExperience name="Dubai" demoMode />;
}
