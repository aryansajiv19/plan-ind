"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";

export function useVoterName(id: string) {
  const [voterName, setVoterName] = useState<string | null>(null);

  // ── Restore this voter's name (once, per plan) ───────────────────
  useEffect(() => {
    // Sync from localStorage on mount — can't use a useState initializer
    // because localStorage doesn't exist during SSR.
    const saved = localStorage.getItem(`voter:${id}`);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setVoterName(saved);
  }, [id]);

  // Anyone signed in already told us their name in Settings, so asking "who's
  // voting?" invites them to answer differently and appear to their friends
  // under a name their profile doesn't have. Use people.display_name — the
  // same one /home greets them with. Signed-out guests still see the gate,
  // which is the whole point of it.
  const [accountNameTried, setAccountNameTried] = useState(false);
  useEffect(() => {
    if (accountNameTried || localStorage.getItem(`voter:${id}`)) return;
    let active = true;
    void (async () => {
      const { data: { user } } = await getSupabase().auth.getUser();
      // The account's own name (people.display_name, what Settings edits);
      // the sign-in provider's name only if the profile can't be read.
      const { data: me } = user && !user.is_anonymous
        ? await getSupabase().from("people").select("display_name").eq("id", user.id).maybeSingle()
        : { data: null };
      if (!active) return;
      const meta = user?.user_metadata?.full_name ?? user?.user_metadata?.name;
      const name = (me?.display_name?.trim() || (typeof meta === "string" && meta.trim()) || user?.email?.split("@")[0] || "").slice(0, 24);
      if (user && !user.is_anonymous && name) {
        localStorage.setItem(`voter:${id}`, name);
        setVoterName(name);
      }
      setAccountNameTried(true);
    })();
    return () => { active = false; };
  }, [id, accountNameTried]);

  return { voterName, setVoterName, accountNameTried };
}
