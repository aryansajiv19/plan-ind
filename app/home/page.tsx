import AuthProfileBridge from "@/components/AuthProfileBridge";
import HomeExperience from "@/components/HomeExperience";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { memberAge } from "@/lib/age-policy";
import { createClient } from "@/lib/supabase/server";
import { getPlannedWith, getProfileVisits, getWrappedSummary } from "@/lib/social";
import type { Spot } from "@/lib/types";

const APP_VIEWS = ["plan", "discover", "been", "friends", "profile"] as const;
type AppView = (typeof APP_VIEWS)[number];

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const user = await requireUser();
  const supabase = await createClient();
  const age = await memberAge(supabase, user.id);
  if (age === null) redirect("/onboarding");
  const metadataName = user.user_metadata.full_name ?? user.user_metadata.name;
  const fallbackName =
    (typeof metadataName === "string" && metadataName.trim()) ||
    user.email?.split("@")[0] ||
    "Friend";

  // Resolve the profile here rather than waiting for AuthProfileBridge to do it
  // in an effect: the account views key every read off this id, and a client
  // that renders before the row exists shows an empty log that isn't empty.
  // The RPC is idempotent and returns the existing id on every later call.
  const { data: personId } = await supabase.rpc("ensure_authenticated_profile", {
    p_display_name: fallbackName,
  });
  const person = typeof personId === "string" ? personId : null;

  // Fetched here rather than in the client: the account screens then render
  // with their data already present, instead of flashing an empty log that
  // fills in a moment later. All three run under this user's RLS.
  // Resolved here so a link straight to ?view=been renders that tab, instead
  // of painting Plan and swapping after hydration.
  const requestedView = (await searchParams).view;
  const initialView: AppView = APP_VIEWS.includes(requestedView as AppView)
    ? (requestedView as AppView)
    : "plan";

  const [spots, visits, friends, wrapped] = await Promise.all([
    supabase.from("spots").select("*").order("name").limit(120),
    person ? getProfileVisits(person, 50, supabase) : Promise.resolve([]),
    person ? getPlannedWith(person, supabase) : Promise.resolve([]),
    person
      ? getWrappedSummary(user.id, person, supabase)
      : Promise.resolve({ data: null, error: "visits" as const }),
  ]);

  return (
    <>
      <AuthProfileBridge fallbackName={fallbackName} />
      <HomeExperience
        name={fallbackName}
        age={age}
        initialView={initialView}
        personId={person}
        spots={(spots.data as Spot[] | null) ?? []}
        visits={visits}
        plannedWith={friends}
        wrappedSummary={wrapped.data}
        wrappedUnavailable={wrapped.error}
      />
    </>
  );
}
