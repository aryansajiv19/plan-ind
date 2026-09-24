import type { SupabaseClient } from "@supabase/supabase-js";

/** The signed-in account's own `people` row, as /home renders it. */
export interface OwnProfile {
  id: string;
  /** null only when the row was just created and could not be re-read. */
  display_name: string | null;
  emoji: string | null;
  color: string | null;
}

const OWN_FIELDS = "id, display_name, emoji, color";

/**
 * Read the account's profile; create it only if it does not exist yet.
 *
 * `ensure_authenticated_profile` is an idempotent write (a definer RPC that
 * selects, then upserts). It used to run on every /home view -- and twice
 * more from the browser (AuthProfileBridge: the RPC plus a re-read). A
 * profile is created exactly once per account, so the steady state is now one
 * indexed read (`people.auth_user_id` is unique) that /home needed anyway for
 * the display name; the RPC runs only on the first view after sign-up.
 *
 * Why read-first rather than a "profile ensured" cookie or the auth callback:
 * the row itself is the only fact that cannot go stale. A cookie outlives a
 * deleted account (migration 060) and would skip re-creation; the callback
 * misses the email-OTP path (a server action, not /auth/callback) and any
 * session that predates the change. Read-first needs no new state at all.
 *
 * A failed read falls through to the RPC -- exactly the old behaviour, which
 * returns the existing id when the row is already there -- so a transient
 * error costs one extra round trip, never a missing profile. Guests
 * (anonymous sessions) never reach this: requireUser() redirects them, and the
 * RPC and the people read policy both require a permanent account anyway.
 *
 * `db` must be the caller's own session client: RLS ("read permitted people")
 * is what limits the read to this user's row.
 */
export async function ensureOwnProfile(
  db: SupabaseClient,
  userId: string,
  fallbackName: string,
): Promise<OwnProfile | null> {
  const existing = await db
    .from("people")
    .select(OWN_FIELDS)
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (!existing.error && existing.data) return existing.data as OwnProfile;

  const { data: id, error } = await db.rpc("ensure_authenticated_profile", {
    p_display_name: fallbackName,
  });
  if (error || typeof id !== "string") return null;

  const created = await db.from("people").select(OWN_FIELDS).eq("id", id).maybeSingle();
  return (created.data as OwnProfile | null) ?? { id, display_name: null, emoji: null, color: null };
}
