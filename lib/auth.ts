import { cache } from "react";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { memberAge } from "@/lib/age-policy";

export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.is_anonymous ? null : user;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Guard a post-auth redirect target. Only an internal path is safe — a
 * protocol-relative `//host` or absolute URL would send a signed-in session
 * off-site. Anything else falls back to `/home`, the default landing.
 *
 * Shared by `/auth/callback` (the OAuth/magic-link round trip) and the OTP
 * sign-in path in `app/auth/actions.ts`, so there is exactly one copy of this
 * check rather than one per call site.
 */
export function safeNextPath(value: string | null | undefined): string {
  // "/\\evil.com" is normalised to "//evil.com" by some browsers.
  return value?.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/home";
}

/**
 * Where a fresh sign-in lands. Everyone joining a plan now has an account
 * (owner decision 2026-09-25), and an account needs a date of birth, so a
 * first-time member detours through /onboarding with `next` carried along;
 * everyone else goes straight to `next`. A failed age read also detours:
 * /onboarding re-checks and forwards on, so the worst case is one extra hop.
 */
export async function landingAfterSignIn(supabase: SupabaseClient, userId: string, next: string): Promise<string> {
  if (await memberAge(supabase, userId) !== null) return next;
  return `/onboarding?next=${encodeURIComponent(next)}`;
}
