import AuthProfileBridge from "@/components/AuthProfileBridge";
import HomeExperience from "@/components/HomeExperience";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { memberAge } from "@/lib/age-policy";
import { createClient } from "@/lib/supabase/server";
import { ensureOwnProfile } from "@/lib/own-profile";
import { curatedDiscover, DISCOVER_COLUMNS } from "@/lib/spots/catalogue";
import { mergeDiscoverSpots } from "@/lib/spots/discover";
import {
  chosenEmoji,
  emptyRead,
  getFriends,
  getPlannedWith,
  getProfileVisits,
  getVisitCollections,
  getVisitPhotos,
  getWrappedSummary,
} from "@/lib/social";
import type { PlannedWith, VisitCollectionView } from "@/lib/social";
import type { PersonCard, ProfileVisit, Spot } from "@/lib/types";

const APP_VIEWS = ["plan", "discover", "been", "friends", "profile"] as const;
type AppView = (typeof APP_VIEWS)[number];
const DISCOVER_LIMIT = 120;

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

  // Resolve the profile here rather than waiting for a client effect: the
  // account views key every read off this id, and a client that renders
  // before the row exists shows an empty log that isn't empty. Read first,
  // create only when missing -- the ensure RPC is an idempotent WRITE, and
  // it used to run on every /home view (plus twice more from the browser).
  // Now it runs once, on the first view after sign-up; see ensureOwnProfile.
  const me = await ensureOwnProfile(supabase, user.id, fallbackName);
  const person = me?.id ?? null;

  // The name this account shows as is people.display_name -- what Settings
  // edits and friends see. The sign-in provider's name only seeds a new
  // profile; greeting from it made a saved rename appear not to stick. A
  // failed read falls back to it rather than showing nothing.
  const displayName = me?.display_name?.trim() || fallbackName;

  // Fetched here rather than in the client: the account screens then render
  // with their data already present, instead of flashing an empty log that
  // fills in a moment later. All three run under this user's RLS.
  // Resolved here so a link straight to ?view=been renders that tab, instead
  // of painting Plan and swapping after hydration.
  const requestedView = (await searchParams).view;
  const initialView: AppView = APP_VIEWS.includes(requestedView as AppView)
    ? (requestedView as AppView)
    : "plan";

  const [curatedSpots, ownSpots, visits, friends, wrapped, collections, photos, realFriends] = await Promise.all([
    // The grid is "every spot this user may read, by name, first 120" --
    // now in two halves. Curated rows are identical for every caller, so they
    // come from the shared catalogue cache (lib/spots/catalogue.ts); the rest
    // (own custom, community, plan-shared) is per-user under RLS and stays a
    // live read. mergeDiscoverSpots rebuilds the single-query answer. The age
    // gate is applied per viewer in the grid, exactly as before.
    curatedDiscover(DISCOVER_LIMIT),
    // Narrowed from select("*"): traced every field AccountViews's Discover
    // tab (PlaceCard, search/filter) actually reads (2026-09-04, production-
    // readiness pass). minimum_age/booking_url/source/visibility/
    // created_by_user_id/address/latitude/longitude are dropped here --
    // `Spot`'s type still claims the full shape, so don't start reading a
    // dropped field from this particular query without adding it back.
    // minimum_age was added back 2026-09-07: the Discover grid now applies
    // the same age gate as StartPlanForm and ActionSearchBar, and it cannot
    // do that on rows that do not carry the column.
    supabase.from("spots").select(DISCOVER_COLUMNS).neq("source", "curated").order("name").order("id").limit(DISCOVER_LIMIT),
    person ? getProfileVisits(person, 50, supabase) : Promise.resolve(emptyRead<ProfileVisit>()),
    person ? getPlannedWith(person, supabase) : Promise.resolve(emptyRead<PlannedWith>()),
    person
      ? getWrappedSummary(user.id, person, supabase)
      : Promise.resolve({ data: null, error: "visits" as const }),
    person ? getVisitCollections(person, supabase) : Promise.resolve(emptyRead<VisitCollectionView>()),
    person ? getVisitPhotos(person, supabase) : Promise.resolve([]),
    person ? getFriends(person, supabase) : Promise.resolve(emptyRead<PersonCard>()),
  ]);
  // Either half failing renders [] -- what the single query rendered on
  // failure -- rather than half a grid that looks complete.
  const spots = curatedSpots.data && ownSpots.data && !ownSpots.error
    ? mergeDiscoverSpots(curatedSpots.data as unknown as Spot[], ownSpots.data as unknown as Spot[], DISCOVER_LIMIT)
    : [];

  return (
    <>
      <AuthProfileBridge
        fallbackName={fallbackName}
        profile={me?.display_name && me.color
          ? { id: me.id, display_name: me.display_name, emoji: me.emoji, color: me.color }
          : null}
      />
      <HomeExperience
        name={displayName}
        emoji={chosenEmoji(me?.emoji)}
        age={age}
        initialView={initialView}
        personId={person}
        spots={spots}
        visits={visits.rows}
        visitsUnavailable={visits.failed}
        plannedWith={friends.rows}
        plannedWithUnavailable={friends.failed}
        friends={realFriends.rows}
        friendsUnavailable={realFriends.failed}
        wrappedSummary={wrapped.data}
        wrappedUnavailable={wrapped.error}
        collections={collections.rows}
        photos={photos}
      />
    </>
  );
}
