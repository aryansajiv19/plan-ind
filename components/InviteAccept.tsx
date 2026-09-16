"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { previewFriendInvite, redeemFriendInvite, type InvitePreview, type RedeemResult } from "@/lib/social";

// The token is stripped from the address bar on arrival, so it is kept here
// to survive the sign-in round trip and a "Try again" reload. Cleared once
// the invite reaches a final answer.
const STASH = "friend-invite";

function stash(write?: string | null) {
  try {
    if (write === undefined) return sessionStorage.getItem(STASH);
    if (write === null) sessionStorage.removeItem(STASH);
    else sessionStorage.setItem(STASH, write);
  } catch {
    // Private mode / blocked storage: the invite just won't survive sign-in.
  }
  return null;
}

type State =
  | { step: "loading" }
  | { step: "no-token" }
  | { step: "signed-out" }
  | { step: "profile-failed" }
  | { step: "preview"; preview: InvitePreview }
  | { step: "done"; result: RedeemResult["result"]; name: string };

/**
 * Accepting a friend invite. A friendship opens each person's visit log to
 * the other, so this page NEVER redeems on load: it previews who sent the
 * link and waits for an explicit tap on a button naming them. A link that
 * auto-accepted would let anyone who can get you to open a URL into your
 * history — the hole migration 048 closed, reopened one layer up.
 */
export default function InviteAccept({
  signedIn,
  accountName,
  profileFailed,
}: {
  signedIn: boolean;
  /** This account's display name, shown beside Accept. Null when signed out. */
  accountName: string | null;
  /** The account's profile row couldn't be created or read; redeem would refuse. */
  profileFailed: boolean;
}) {
  const [state, setState] = useState<State>({ step: "loading" });
  const [token, setToken] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    let latest = 0; // only the most recent read may set the preview
    // Runs on load AND on hashchange: opening /invite#token while already on
    // /invite is a same-document navigation -- no reload, no remount -- so
    // reading the fragment only once left a valid link showing "no invite".
    const readInvite = () => {
      const read = ++latest;
      const fromHash = window.location.hash.slice(1);
      // Take the token out of the address bar so it doesn't linger in history
      // or end up in a screenshot someone shares.
      if (fromHash) window.history.replaceState(null, "", window.location.pathname);
      const found = /^[0-9a-f]{64}$/.test(fromHash) ? fromHash : stash();
      if (!found) {
        setState({ step: "no-token" });
        return;
      }
      setToken(found);
      stash(found);
      if (!signedIn) {
        setState({ step: "signed-out" });
        return;
      }
      if (profileFailed) {
        setState({ step: "profile-failed" });
        return;
      }
      setState({ step: "loading" });
      void previewFriendInvite(found).then((preview) => {
        if (preview.result === "self" || preview.result === "invalid") stash(null);
        if (active && read === latest) setState({ step: "preview", preview });
      });
    };
    readInvite();
    window.addEventListener("hashchange", readInvite);
    return () => {
      active = false;
      window.removeEventListener("hashchange", readInvite);
    };
  }, [signedIn, profileFailed]);

  async function accept(name: string) {
    if (!token) return;
    setPending(true);
    const { result } = await redeemFriendInvite(token);
    setPending(false);
    if (result !== "unavailable") stash(null);
    setState({ step: "done", result, name });
  }

  let title: string;
  let body: string;
  let action: React.ReactNode = null;
  const toFriends = <Link href="/home?view=friends" className="vote-secondary-action">Go to Friends</Link>;

  switch (state.step) {
    case "loading":
      title = "Checking your invite…";
      body = "One moment.";
      break;
    // Most often the link was fine and this tab never saw it -- e.g. the
    // sign-in email opened a new tab. Don't blame the link.
    case "no-token":
      title = "We couldn’t find an invite in this tab";
      body = "Open the invite link again from where your friend sent it.";
      break;
    case "profile-failed":
      title = "We couldn’t set up your account for this";
      body = "Something went wrong on our side. Try again in a moment.";
      action = <button type="button" className="vote-primary-action" onClick={() => window.location.reload()}>Try again</button>;
      break;
    case "signed-out":
      title = "Someone wants to be friends";
      body = "Sign in to see who sent this. Nothing happens until you accept.";
      action = <Link href="/login?next=/invite" className="vote-primary-action">Sign in</Link>;
      break;
    case "preview": {
      const p = state.preview;
      if (p.result === "valid") {
        title = `${p.emoji ? `${p.emoji} ` : ""}${p.displayName} wants to be friends`;
        // Naming the accepting account matters on a shared browser, where the
        // session may not be the person who opened the link.
        body = `Friends can see each other’s visit log — where you’ve been, when, and who with. Only accept if you know them.${accountName ? ` You’re accepting as ${accountName}.` : ""}`;
        action = (
          <>
            <button type="button" className="vote-primary-action" disabled={pending} onClick={() => void accept(p.displayName)}>
              {pending ? "Accepting…" : `Accept ${p.displayName}`}
            </button>
            <Link href="/home" className="vote-secondary-action" onClick={() => stash(null)}>Not now</Link>
          </>
        );
      } else if (p.result === "self") {
        title = "That’s your own invite";
        body = "Send this link to a friend — they accept it from their account.";
        action = toFriends;
      } else if (p.result === "invalid") {
        title = "This invite has expired or been used";
        body = "Invites work once and last a week. Ask your friend for a new one.";
      } else {
        title = "We couldn’t check this invite";
        body = "Something went wrong on our side, not with the link. Try again in a moment.";
        action = <button type="button" className="vote-primary-action" onClick={() => window.location.reload()}>Try again</button>;
      }
      break;
    }
    case "done":
      if (state.result === "friends" || state.result === "already_friends") {
        title = state.result === "friends" ? `You and ${state.name} are friends` : `You and ${state.name} were already friends`;
        body = "You can remove a friend any time from the Friends tab.";
        action = toFriends;
      } else if (state.result === "self") {
        title = "That’s your own invite";
        body = "You’re signed in as the person who sent it. Send the link to a friend instead.";
        action = toFriends;
      } else if (state.result === "unavailable") {
        title = "That didn’t go through";
        body = "Nothing changed. Try accepting again in a moment.";
        action = <button type="button" className="vote-primary-action" onClick={() => window.location.reload()}>Try again</button>;
      } else {
        title = "This invite has expired or been used";
        body = "Invites work once and last a week. Ask your friend for a new one.";
      }
      break;
  }

  return (
    <main className="vote-experience vote-state">
      <div className="vote-state__inner">
        <h1 className="vote-state__title">{title}</h1>
        {body && <p className="vote-state__body" role={state.step === "loading" ? "status" : undefined}>{body}</p>}
        {action && <div className="vote-state__actions">{action}</div>}
      </div>
    </main>
  );
}
