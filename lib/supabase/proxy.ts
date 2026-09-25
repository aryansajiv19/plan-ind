import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "./config";

/** Who the refreshed cookie session belongs to, as far as the proxy can tell. */
export type ProxySession = "none" | "anonymous" | "member";

export async function updateSession(
  request: NextRequest,
  requestHeaders?: Headers,
  /** Sign an anonymous session out on this request (the cookie clears ride on the response). */
  { signOutAnonymous = false }: { signOutAnonymous?: boolean } = {},
): Promise<{ response: NextResponse; session: ProxySession }> {
  let response = NextResponse.next({
    request: requestHeaders ? { headers: requestHeaders } : undefined,
  });
  const { url, key } = getSupabaseConfig();

  const supabase = createServerClient(url, key, {
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({
          request: requestHeaders ? { headers: requestHeaders } : undefined,
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, {
            ...options,
            path: "/",
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
          });
        });
      },
    },
  });

  // This validates (and, when needed, refreshes) the cookie-backed session.
  // Authorization still happens at pages/actions and in Postgres RLS.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return { response, session: "none" };
  if (!claims.is_anonymous) return { response, session: "member" };

  // Share-link guests used to get an anonymous session. Every plan now needs a
  // real account (owner decision 2026-09-25), so a leftover guest session is
  // ended rather than carried into sign-in: the person gets a fresh account,
  // not one grafted onto a throwaway anonymous user id.
  if (signOutAnonymous) {
    await supabase.auth.signOut({ scope: "local" });
    return { response, session: "none" };
  }
  return { response, session: "anonymous" };
}
