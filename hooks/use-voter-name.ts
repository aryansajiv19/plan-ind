"use client";

import { useEffect, useState } from "react";
import { getSupabase, readAccount } from "@/lib/supabase";

// The name this account shows on a plan: its profile name (review F2). The
// account is the voter, so there is no per-plan name to type or cache; a
// rename in Settings shows on the next load. 40 characters, the server's cap.
export function useVoterName() {
  const [voterName, setVoterName] = useState<string | null>(null);
  const [accountNameTried, setAccountNameTried] = useState(false);
  // A failed read (auth or profile) is "couldn't check", never "no name".
  const [nameFailed, setNameFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      const account = await readAccount();
      const user = account === "unavailable" ? null : account.user;
      const profile = user && !user.is_anonymous
        ? await getSupabase().from("people").select("display_name").eq("id", user.id).maybeSingle()
        : { data: null, error: null };
      if (!active) return;
      if (account === "unavailable" || profile.error) {
        setNameFailed(true);
        return;
      }
      const me = profile.data;
      const meta = user?.user_metadata?.full_name ?? user?.user_metadata?.name;
      const name = (me?.display_name?.trim() || (typeof meta === "string" && meta.trim()) || user?.email?.split("@")[0] || "").slice(0, 40);
      if (user && !user.is_anonymous && name) setVoterName(name);
      setAccountNameTried(true);
    })();
    return () => { active = false; };
  }, [attempt]);

  const retryName = () => { setNameFailed(false); setAttempt((n) => n + 1); };
  return { voterName, accountNameTried, nameFailed, retryName };
}
