import { createClient } from "./supabase/client";

// Shared browser client. @supabase/ssr stores the authenticated session in
// cookies so Server Components, Actions, Route Handlers, and browser queries
// all observe the same user.
export const supabase = createClient();
