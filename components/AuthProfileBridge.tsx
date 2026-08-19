"use client";

import { useEffect } from "react";
import { cacheMe, getMe } from "@/lib/device";
import { getPerson } from "@/lib/social";
import { supabase } from "@/lib/supabase";

export default function AuthProfileBridge({ fallbackName }: { fallbackName: string }) {
  useEffect(() => {
    let cancelled = false;

    async function ensureProfile() {
      const localProfile = getMe();
      const displayName = (localProfile?.display_name ?? fallbackName)
        .trim()
        .slice(0, 40);

      const { data: profileId, error } = await supabase.rpc(
        "ensure_authenticated_profile",
        {
          p_display_name: displayName || "Friend",
          p_emoji: "?",
          p_color: "#34363b",
        },
      );

      if (cancelled || error || typeof profileId !== "string") return;
      const profile = await getPerson(profileId);
      if (!cancelled && profile) cacheMe(profile);
    }

    void ensureProfile();
    return () => {
      cancelled = true;
    };
  }, [fallbackName]);

  return null;
}
