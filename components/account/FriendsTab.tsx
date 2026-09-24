"use client";

import { useRouter } from "next/navigation";
import FriendsPanel from "@/components/FriendsPanel";
import UnavailableState from "@/components/account/UnavailableState";
import { avatarStyle, initialsOf } from "@/lib/avatar";
import type { PlannedWith } from "@/lib/social";
import type { PersonCard } from "@/lib/types";

export default function FriendsTab({
  personId,
  friends,
  friendsUnavailable,
  plannedWith,
  plannedWithUnavailable,
  onStartPlan,
}: {
  personId: string | null;
  friends: PersonCard[];
  friendsUnavailable: boolean;
  plannedWith: PlannedWith[];
  plannedWithUnavailable: boolean;
  onStartPlan: () => void;
}) {
  const router = useRouter();
  return (
    <section className="demo-view" aria-labelledby="friends-title">
      <header className="demo-view__header demo-view__header--split">
        <div><p className="home-section-kicker">Your planning circle</p><h1 id="friends-title">The people you actually go out with.</h1></div>
        <button type="button" className="demo-primary-action" onClick={onStartPlan}>Start a group plan</button>
      </header>

      {personId && (
        <FriendsPanel personId={personId} friends={friends} unavailable={friendsUnavailable} onChanged={() => router.refresh()} />
      )}

      <h2 className="friends-panel__subhead">People you’ve been out with</h2>
      {plannedWithUnavailable ? (
        <UnavailableState what="people" />
      ) : plannedWith.length === 0 ? (
        <div className="demo-collection-empty">
          <strong>Nobody here yet.</strong>
          <p>Everyone who comes along on a plan lands here once you rate it. Start one and share the link.</p>
          <button type="button" onClick={onStartPlan}>Start a plan</button>
        </div>
      ) : (
        <div className="demo-friend-layout">
          <div className="demo-friend-list">
            {plannedWith.map((friend) => (
              <article key={friend.name} className="demo-friend-row">
                <span className="demo-friend-avatar" aria-hidden="true" style={avatarStyle(friend.name)}>
                  {initialsOf(friend.name)}
                </span>
                <div>
                  <h2>{friend.name}</h2>
                  {!friend.person && <p>Came along · no account yet</p>}
                </div>
                <div className="demo-friend-row__numbers">
                  <strong>{friend.shared}</strong>
                  <span>{friend.shared === 1 ? "outing" : "outings"}</span>
                </div>
                <button type="button" onClick={onStartPlan}>Plan together</button>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
