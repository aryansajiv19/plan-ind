import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/home";
}
