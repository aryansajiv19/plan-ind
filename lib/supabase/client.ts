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
    // A request that hangs (a dropped connection, a stuck upstream) would
    // leave an optimistic vote or RSVP unconfirmed until the browser gave up.
    // Bounded here, so every read and RPC fails into its error path in 15s.
    // Realtime is a WebSocket and is unaffected.
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(15_000) }),
    },
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  });
}
