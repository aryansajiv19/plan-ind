"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";

/**
 * Take back your own rating (052's `unrate_plan`). Lives here rather than as
 * another handler on the plan page: the page already refetches ratings on
 * every Realtime ratings event, so removing the row is the whole job.
 *
 * Who sees it: any signed-in account looking at a rating under its own voter
 * name. It CANNOT be narrower than that — `ratings.user_id` is not granted to
 * `authenticated`, so the browser cannot tell whether the row was written by
 * this account or left as a guest on this device. The RPC matches on
 * auth.uid() and answers `not_rated` when it wasn't yours, which is the one
 * case this component has to explain rather than silently do nothing.
 */
export default function UnrateButton({ planId }: { planId: string }) {
  const [signedIn, setSignedIn] = useState(false);
  const [armed, setArmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getSupabase().auth.getUser().then(({ data }) => {
      if (active) setSignedIn(Boolean(data.user) && !data.user?.is_anonymous);
    });
    return () => { active = false; };
  }, []);

  async function remove() {
    setPending(true);
    setMessage(null);
    const { data, error } = await getSupabase().rpc("unrate_plan", { p_plan_id: planId });
    setPending(false);
    setArmed(false);
    const result = (data as { result?: string } | null)?.result;
    if (error || !result) { setMessage("Couldn’t remove your rating. Try again."); return; }
    // Removed: the Realtime ratings event re-reads the list, so there is
    // nothing to say. not_rated: the row belongs to a guest session on this
    // device, not to this account, and saying nothing would look broken.
    if (result === "not_rated") setMessage("That rating wasn’t left from this account, so it can’t be removed here.");
  }

  if (!signedIn) return null;

  if (armed) {
    return (
      <span className="vote-unrate" role="group" aria-label="Confirm removing your rating">
        <span>Remove your rating? The visit stays in your Been.</span>
        <button type="button" disabled={pending} onClick={() => void remove()}>{pending ? "Removing…" : "Remove rating"}</button>
        <button type="button" disabled={pending} onClick={() => setArmed(false)}>Keep it</button>
      </span>
    );
  }

  return (
    <span className="vote-unrate">
      <button type="button" onClick={() => { setArmed(true); setMessage(null); }}>Remove my rating</button>
      {message && <span role="alert" className="vote-unrate__error">{message}</span>}
    </span>
  );
}
