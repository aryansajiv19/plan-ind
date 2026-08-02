import { createClient } from "@supabase/supabase-js";

// Single browser-side client. No auth in v1 — everything runs through the
// public anon key, gated by RLS policies (see supabase/schema.sql).
// Both values are safe to expose to the browser; the anon key is meant to be.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing Supabase env vars. Copy .env.local.example to .env.local and fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
  );
}

export const supabase = createClient(url, anonKey);
