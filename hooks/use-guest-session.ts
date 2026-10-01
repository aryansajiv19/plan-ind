"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase, readAccount } from "@/lib/supabase";
import { issueGuestMergeToken, mergeGuestVotes } from "@/lib/guest";
import { secureJsonFetch } from "@/lib/security/csrf-client";

// Guest voting, browser side (migration 099, docs/GUEST_VOTE.md).

const nameKey = (planId: string) => `planind-guest-name:${planId}`;
// sessionStorage can throw (blocked storage); a lost cache only costs one call.
const remember = (planId: string, name: string) => { try { window.sessionStorage.setItem(nameKey(planId), name); } catch { /* best effort */ } };
const recall = (planId: string) => { try { return recall(planId); } catch { return null; } };
export const rememberGuestName = remember;
const mergeKey = (planId: string) => `planind-guest-merge:${planId}`;

/**
 * Is this anonymous session an active guest of the plan? A guest can read its
 * plan (RLS), anyone else cannot, so a readable row is the answer. The stored
 * name is only reachable through the join route, which answers `already` for
 * the same plan without a new session or a new Turnstile check. Null for
 * "not a guest of this plan" (no session, an account, a stale or expired pass).
 */
export async function resumeGuest(planId: string): Promise<string | null> {
  const account = await readAccount();
  if (account === "unavailable" || !account.user?.is_anonymous) return null;
  const { data } = await getSupabase().from("plans").select("id").eq("id", planId).maybeSingle();
  if (!data) return null;
  // The join route counts every call against the per-IP limit, so a guest who
  // reloads reuses the name this tab already learned.
  const cached = recall(planId);
  if (cached) return cached;
  try {
    const response = await secureJsonFetch("/api/guest/join", { method: "POST", body: JSON.stringify({ planId, name: "Guest" }) });
    const body = await response.json() as { ok?: boolean; name?: string };
    if (!response.ok || !body.ok || !body.name) return null;
    remember(planId, body.name);
    return body.name;
  } catch {
    return null;
  }
}

/**
 * Before a guest is sent to sign in: take the one-time merge token and keep it
 * across the redirect (/login ends the anonymous session). False = nothing was
 * stored, so the caller must NOT navigate: the guest keeps the session.
 */
export async function keepGuestVotes(planId: string): Promise<boolean> {
  const token = await issueGuestMergeToken(getSupabase());
  if (!token) return false;
  try {
    window.localStorage.setItem(mergeKey(planId), token);
    return true;
  } catch {
    return false;
  }
}

/**
 * After sign-in: move the guest's ballots onto the account (idempotent, the
 * account's own rows win). A failure keeps the token and reports `failed`, so
 * the page offers a plain retry; nothing here touches the session.
 */
export function useGuestMerge({ planId, ready, onMerged }: { planId: string; ready: boolean; onMerged: () => Promise<unknown> }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const merged = useRef(onMerged);
  useEffect(() => { merged.current = onMerged; });
  useEffect(() => {
    if (!ready) return;
    let token: string | null = null;
    try { token = window.localStorage.getItem(mergeKey(planId)); } catch { /* storage blocked: nothing to merge */ }
    if (!token) return;
    let active = true;
    void (async () => {
      const result = await mergeGuestVotes(getSupabase(), token);
      if (!active) return;
      if (!result) { setFailed(true); return; }
      try { window.localStorage.removeItem(mergeKey(planId)); } catch { /* best effort */ }
      await merged.current();
    })();
    return () => { active = false; };
  }, [planId, ready, attempt]);

  const retry = useCallback(() => { setFailed(false); setAttempt((n) => n + 1); }, []);
  const dismiss = useCallback(() => {
    try { window.localStorage.removeItem(mergeKey(planId)); } catch { /* best effort */ }
    setFailed(false);
  }, [planId]);
  return { mergeFailed: failed, retryMerge: retry, dismissMerge: dismiss };
}
