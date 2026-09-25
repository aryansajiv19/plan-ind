"use client";

// The signed-in account: Discover, Been, Friends and Profile read from
// Supabase. DemoAccountViews is the same four screens filled with fixtures —
// it stays for /demo, where nobody is signed in and there is nothing
// real to show. Keeping the fixtures out of here is the point: a signed-in
// person's own history is the one thing that must never be invented.
//
// Every screen has a real empty state. A new account genuinely has no visits
// and no friends, and saying so is more useful than borrowing someone else's.

import DiscoverTab, { useDiscoverSearch } from "@/components/account/DiscoverTab";
import BeenTab from "@/components/account/BeenTab";
import useBeenCollections from "@/components/account/useBeenCollections";
import FriendsTab from "@/components/account/FriendsTab";
import ProfileTab from "@/components/account/ProfileTab";
import useVisitStats from "@/components/account/useVisitStats";
import useMoodboards from "@/components/account/useMoodboards";
import type { PlanPrefill } from "@/lib/board-plan";
import type { PlannedWith, VisitCollectionView, VisitPhotoView } from "@/lib/social";
import type {
  PersonCard,
  ProfileVisit,
  Spot,
  WrappedSummary,
  WrappedSummaryError,
} from "@/lib/types";

type AccountView = "discover" | "been" | "friends" | "profile";

export default function AccountViews({
  view,
  name,
  emoji,
  personId,
  spots,
  age,
  visits,
  plannedWith,
  wrappedSummary,
  wrappedUnavailable,
  collections: initialCollections,
  visitsUnavailable,
  plannedWithUnavailable,
  friends,
  friendsUnavailable,
  photos,
  onStartPlan,
  onPlanFromBoard,
}: {
  view: AccountView;
  name: string;
  emoji: string | null;
  personId: string | null;
  spots: Spot[];
  /** Server-owned age, for the same gate the other catalogue paths apply. */
  age: number;
  visits: ProfileVisit[];
  plannedWith: PlannedWith[];
  wrappedSummary: WrappedSummary | null;
  wrappedUnavailable: WrappedSummaryError | null;
  collections: VisitCollectionView[];
  /** These mean the READ FAILED, never "there are none". Rendering an empty
   *  state for a failed read tells a returning user their history does not
   *  exist — see lib/social's ListRead.
   *
   *  Collections has no equivalent flag on purpose. A failed collections read
   *  costs the filter tabs, which never claim anything: "All places" is always
   *  present, and there is no "you have no collections" copy to be wrong. The
   *  test is whether the empty value is rendered AS A CLAIM, and here it is
   *  not — so the honest thing is no state rather than plumbing nothing
   *  through to nowhere. */
  visitsUnavailable: boolean;
  plannedWithUnavailable: boolean;
  friends: PersonCard[];
  friendsUnavailable: boolean;
  photos: VisitPhotoView[];
  onStartPlan: () => void;
  onPlanFromBoard: (prefill: PlanPrefill) => void;
}) {
  // Every tab's state lives up here, not in the tab: this one instance stays
  // mounted across a tab switch, so a search, a new collection or a picked
  // upload is still there when you come back.
  const search = useDiscoverSearch(spots, age);
  const been = useBeenCollections({ personId, visits, photos, initialCollections });
  const stats = useVisitStats(visits);
  // Loaded the first time Discover opens, then kept across tab switches.
  const boards = useMoodboards(personId, view === "discover");

  if (view === "discover") {
    return (
      <DiscoverTab
        spots={spots}
        search={search}
        boards={boards}
        age={age}
        onStartPlan={onStartPlan}
        onPlanFromBoard={onPlanFromBoard}
      />
    );
  }

  if (view === "been") {
    return (
      <BeenTab
        personId={personId}
        visits={visits}
        photos={photos}
        visitsUnavailable={visitsUnavailable}
        stats={stats}
        been={been}
        onStartPlan={onStartPlan}
      />
    );
  }

  if (view === "friends") {
    return (
      <FriendsTab
        personId={personId}
        friends={friends}
        friendsUnavailable={friendsUnavailable}
        plannedWith={plannedWith}
        plannedWithUnavailable={plannedWithUnavailable}
        onStartPlan={onStartPlan}
      />
    );
  }

  return (
    <ProfileTab
      name={name}
      emoji={emoji}
      personId={personId}
      stats={stats}
      plannedWith={plannedWith}
      wrappedSummary={wrappedSummary}
      wrappedUnavailable={wrappedUnavailable}
    />
  );
}
