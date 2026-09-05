import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "./config";

export function createClient() {
  const { url, key } = getSupabaseConfig();
  // createBrowserClient is a browser singleton by default, so repeated calls
  // reuse one auth-aware client without erasing its inferred schema type.
  // No httpOnly, deliberate: see lib/supabase/server.ts's matching comment.
  // This client needs the same cookie JS-readable to manage its own
  // session state -- httpOnly would break sign-in, not secure it further.
  return createBrowserClient(url, key, {
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  });
}
