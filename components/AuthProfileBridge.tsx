"use client";

import { useEffect } from "react";
import { cacheMe, getMe } from "@/lib/device";
import { getPerson } from "@/lib/social";
import { getSupabase } from "@/lib/supabase";
import type { PersonCard } from "@/lib/types";

/**
 * Mirrors the signed-in profile into this device's cache (lib/device.ts).
 *
 * /home resolves the profile on the server (lib/own-profile.ts) and passes it
 * in, so the normal path costs no network at all -- this used to call
 * ensure_authenticated_profile and re-read the row on every /home view, after
 * the server had already done both. The RPC path below runs only when the
 * server could not resolve a profile (a failed read or RPC), as a retry.
 */
export default function AuthProfileBridge({
  fallbackName,
  profile,
}: {
  fallbackName: string;
  profile: PersonCard | null;
}) {
  useEffect(() => {
    if (profile) {
      cacheMe(profile);
      return;
    }
    let cancelled = false;

    async function ensureProfile() {
      const localProfile = getMe();
      const displayName = (localProfile?.display_name ?? fallbackName)
        .trim()
        .slice(0, 40);

      const { data: profileId, error } = await getSupabase().rpc(
        "ensure_authenticated_profile",
        {
          p_display_name: displayName || "Friend",
          p_emoji: "?",
          p_color: "#34363b",
        },
      );

      if (cancelled || error || typeof profileId !== "string") return;
      const person = await getPerson(profileId);
      if (!cancelled && person) cacheMe(person);
    }

    void ensureProfile();
    return () => {
      cancelled = true;
    };
  }, [fallbackName, profile]);

  return null;
}
