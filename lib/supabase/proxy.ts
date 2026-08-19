import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "./config";

export async function updateSession(request: NextRequest, requestHeaders?: Headers) {
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
  await supabase.auth.getClaims();

  return response;
}
