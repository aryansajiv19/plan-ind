import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "./config";

// A request that hangs (a dropped connection, a stuck upstream) would leave
// an optimistic vote or RSVP unconfirmed until the browser gave up, so every
// read and RPC fails into its error path in 15s. Photo uploads are exempt:
// up to 8 MB (lib/upload.ts) outlasts 15s on a slow phone uplink. Realtime
// is a WebSocket and never comes through here.
function boundedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const upload = url.includes("/storage/v1/object/") && (init?.method === "POST" || init?.method === "PUT");
  if (upload || init?.signal) return fetch(input, init);
  return fetch(input, { ...init, signal: AbortSignal.timeout(15_000) });
}

export function createClient() {
  const { url, key } = getSupabaseConfig();
  // createBrowserClient is a browser singleton by default, so repeated calls
  // reuse one auth-aware client without erasing its inferred schema type.
  // No httpOnly, deliberate: see lib/supabase/server.ts's matching comment.
  // This client needs the same cookie JS-readable to manage its own
  // session state -- httpOnly would break sign-in, not secure it further.
  return createBrowserClient(url, key, {
    global: { fetch: boundedFetch },
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  });
}
