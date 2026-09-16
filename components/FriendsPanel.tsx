"use client";

import { useState } from "react";
import { avatarStyle, initialsOf } from "@/lib/avatar";
import { chosenEmoji, createFriendInvite, removeFriend } from "@/lib/social";
import type { PersonCard } from "@/lib/types";

/**
 * Real friendships: the invite that creates one, and the remove that undoes
 * it. Distinct from "people you went out with" below it, which is derived
 * from visits and grants nothing — a friendship shares visit logs both ways,
 * which is why it takes an invite the other person has to accept.
 */
export default function FriendsPanel({
  personId,
  friends,
  unavailable,
  onChanged,
}: {
  personId: string;
  friends: PersonCard[];
  unavailable: boolean;
  onChanged: () => void;
}) {
  const [invite, setInvite] = useState<string | null>(null);
  const [inviteNote, setInviteNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [armed, setArmed] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function makeInvite() {
    setPending(true);
    setInviteNote(null);
    const created = await createFriendInvite();
    setPending(false);
    if (created.result === "created") {
      // Fragment, not query: never sent to a server, never in a Referer.
      setInvite(`${window.location.origin}/invite#${created.token}`);
      setCopied(false);
    } else {
      setInviteNote(created.result === "too_many"
        ? "You have 20 invites waiting to be accepted. Wait for some to be used or expire (after a week)."
        : "Couldn’t create an invite. Try again in a moment.");
    }
  }

  async function copyInvite() {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite);
      setCopied(true);
    } catch {
      setInviteNote("Couldn’t copy automatically — select the link and copy it.");
    }
  }

  async function remove(friend: PersonCard) {
    setPending(true);
    setError(null);
    const ok = await removeFriend(personId, friend.id);
    setPending(false);
    setArmed(null);
    if (!ok) { setError(`Couldn’t remove ${friend.display_name}. Try again.`); return; }
    onChanged();
  }

  return (
    <section className="friends-panel" aria-labelledby="friends-panel-title">
      <div className="friends-panel__head">
        <div>
          <h2 id="friends-panel-title">Friends</h2>
          <p>Friends see each other’s visit log. It only happens when they accept your invite.</p>
        </div>
        <button type="button" className="demo-primary-action" disabled={pending} onClick={() => void makeInvite()}>
          Invite a friend
        </button>
      </div>

      {invite && (
        <div className="friends-panel__invite">
          <label htmlFor="friend-invite-link">Send this link to one person. It works once and lasts a week.</label>
          <div>
            <input id="friend-invite-link" readOnly value={invite} onFocus={(e) => e.currentTarget.select()} />
            <button type="button" onClick={() => void copyInvite()}>{copied ? "Copied" : "Copy"}</button>
          </div>
        </div>
      )}
      {inviteNote && <p role="alert" className="friends-panel__note">{inviteNote}</p>}

      {unavailable ? (
        <p className="friends-panel__note">Couldn’t load your friends. Refresh to try again.</p>
      ) : friends.length === 0 ? (
        <p className="friends-panel__empty">No friends yet.</p>
      ) : (
        <ul className="friends-panel__list">
          {friends.map((friend) => (
            <li key={friend.id}>
              <span className="demo-friend-avatar" aria-hidden="true" style={avatarStyle(friend.display_name)}>
                {chosenEmoji(friend.emoji) ?? initialsOf(friend.display_name)}
              </span>
              <span className="friends-panel__name">{friend.display_name}</span>
              {armed === friend.id ? (
                <span className="friends-panel__confirm">
                  <span>They’ll stop seeing your visits, and you theirs.</span>
                  <button type="button" className="friends-panel__danger" disabled={pending} onClick={() => void remove(friend)}>
                    Remove {friend.display_name}
                  </button>
                  <button type="button" disabled={pending} onClick={() => setArmed(null)}>Cancel</button>
                </span>
              ) : (
                <button type="button" disabled={pending} onClick={() => setArmed(friend.id)}>Remove</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="friends-panel__note">{error}</p>}
    </section>
  );
}
