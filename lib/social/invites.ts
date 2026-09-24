import { getSupabase } from "../supabase";
import { chosenEmoji } from "./shared";

// ─── Friend invites (migration 048) ────────────────────────────────
//
// A friendship grants each side the other's visit log, so it only exists
// when BOTH people act: one creates an invite, the other previews who sent
// it and then explicitly accepts. There is deliberately no direct write —
// `addFriend` used to insert any friend_id you liked, and is gone.
//
// Every refusal is its own result. "unavailable" (the call failed) must
// never read as "invalid" (the link is dead) or the user blames the link.

export type CreateInviteResult =
  | { result: "created"; token: string; expiresAt: string }
  | { result: "too_many" }
  | { result: "unavailable" };

export async function createFriendInvite(): Promise<CreateInviteResult> {
  const { data, error } = await getSupabase().rpc("create_friend_invite");
  if (error?.code === "54000") return { result: "too_many" };
  const row = data as { token?: unknown; expires_at?: unknown } | null;
  if (error || typeof row?.token !== "string" || typeof row.expires_at !== "string") {
    return { result: "unavailable" };
  }
  return { result: "created", token: row.token, expiresAt: row.expires_at };
}

export type InvitePreview =
  | { result: "valid"; displayName: string; emoji: string | null; sharedPlans: number | null }
  | { result: "self" | "invalid" | "unavailable" };

/** Who sent this invite. Reads only — never creates a friendship. */
export async function previewFriendInvite(token: string): Promise<InvitePreview> {
  const { data, error } = await getSupabase().rpc("preview_friend_invite", { p_token: token });
  const row = data as { result?: unknown; display_name?: unknown; emoji?: unknown; shared_plans?: unknown } | null;
  if (error || !row) return { result: "unavailable" };
  if (row.result === "valid" && typeof row.display_name === "string") {
    return {
      result: "valid",
      displayName: row.display_name,
      emoji: typeof row.emoji === "string" ? chosenEmoji(row.emoji) : null,
      // 054: how many plans the inviter and this viewer have BOTH joined. The
      // only thing on this screen an impersonator can't choose. Null when an
      // older server doesn't send it -- then no claim is made either way.
      sharedPlans: typeof row.shared_plans === "number" ? row.shared_plans : null,
    };
  }
  if (row.result === "self" || row.result === "invalid") return { result: row.result };
  return { result: "unavailable" };
}

export type RedeemResult = { result: "friends" | "already_friends" | "self" | "invalid" | "unavailable" };

/** Accept an invite. Only ever call this from an explicit user action. */
export async function redeemFriendInvite(token: string): Promise<RedeemResult> {
  const { data, error } = await getSupabase().rpc("redeem_friend_invite", { p_token: token });
  const result = (data as { result?: unknown } | null)?.result;
  if (error) return { result: "unavailable" };
  return result === "friends" || result === "already_friends" || result === "self" || result === "invalid"
    ? { result }
    : { result: "unavailable" };
}
