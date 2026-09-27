"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";

// The name this account shows on a plan: its profile name (review F2). The
// account is the voter, so there is no per-plan name to type or cache; a
// rename in Settings shows on the next load. 40 characters, the server's cap.
export function useVoterName() {
  const [voterName, setVoterName] = useState<string | null>(null);
  const [accountNameTried, setAccountNameTried] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: { user } } = await getSupabase().auth.getUser();
      const { data: me } = user && !user.is_anonymous
        ? await getSupabase().from("people").select("display_name").eq("id", user.id).maybeSingle()
        : { data: null };
      if (!active) return;
      const meta = user?.user_metadata?.full_name ?? user?.user_metadata?.name;
      const name = (me?.display_name?.trim() || (typeof meta === "string" && meta.trim()) || user?.email?.split("@")[0] || "").slice(0, 40);
      if (user && !user.is_anonymous && name) setVoterName(name);
      setAccountNameTried(true);
    })();
    return () => { active = false; };
  }, []);

  return { voterName, accountNameTried };
}
