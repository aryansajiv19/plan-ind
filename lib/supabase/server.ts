import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "./config";

export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = getSupabaseConfig();

  // No httpOnly here, verified deliberate, not an oversight: this same
  // cookie is also read/written by lib/supabase/client.ts's
  // createBrowserClient (the whole point of @supabase/ssr's shared-cookie
  // design), which needs it JS-readable to manage its own session state --
  // an httpOnly session cookie would be invisible to it and break sign-in
  // entirely. Confirmed by reading @supabase/ssr's own source
  // (node_modules/@supabase/ssr/dist/module/*.js never sets httpOnly; it
  // only forwards whatever cookieOptions it's given). The compensating
  // control against cookie theft is the strict CSP (proxy.ts: nonce-based
  // script-src, no unsafe-inline in production) that keeps XSS from ever
  // reaching document.cookie in the first place -- do not "fix" this to
  // httpOnly without redesigning the browser-client session flow first.
  return createServerClient(url, key, {
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, {
              ...options,
              path: "/",
              sameSite: "lax",
              secure: process.env.NODE_ENV === "production",
            });
          });
        } catch {
          // Server Components cannot mutate response cookies. Session refresh
          // is handled by proxy.ts; Actions and Route Handlers can set them.
        }
      },
    },
  });
}
