"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { secureJsonFetch } from "@/lib/security/csrf-client";
import { offerTimes } from "@/components/WhenPicker";
import { GROUP_PREFS_UNAVAILABLE } from "@/lib/gathering";

/**
 * "Share and ask the group": create a plan with no places and land on it, where
 * the friends' answers come in and the host deals. The old composer deal stays
 * as the skip path (use-composer.ts); this only needs a kind of night and a title.
 */
export function useStartGathering({ category, title, times, deal }: { category: string; title: string; times: string[]; deal: () => void }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    const clean = title.trim();
    if (!clean || asking) return;
    setAsking(true);
    setError(null);
    try {
      const response = await secureJsonFetch("/api/plans/gathering", { method: "POST", body: JSON.stringify({ title: clean, category }) });
      const result = await response.json().catch(() => ({})) as { id?: string; hostToken?: string; error?: string; code?: string };
      // Migration 100 is not applied: no error to show. Remember it, and run the old deal for this submit.
      if (result.code === GROUP_PREFS_UNAVAILABLE) {
        setUnavailable(true);
        setAsking(false);
        deal();
        return;
      }
      if (!response.ok || !result.id) {
        setError(result.error ?? "Couldn't start the plan. Try again in a moment.");
        setAsking(false);
        return;
      }
      if (result.hostToken) localStorage.setItem(`plan-host:${result.id}`, result.hostToken);
      const timesSaved = times.length === 0 || await offerTimes(result.id, times).catch(() => false);
      router.push(`/plan/${result.id}${timesSaved ? "" : "?when=unsaved"}`);
    } catch {
      setError("Couldn't start the plan. Check your connection and try again.");
      setAsking(false);
    }
  }
  return { asking, error, ask, unavailable };
}
