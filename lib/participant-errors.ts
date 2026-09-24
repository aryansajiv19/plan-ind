// Turns a participant RPC failure (cast_plan_vote, set_plan_rsvp, rate_plan)
// into what the person should read. Those RPCs raise 22023 with messages
// written for people ("Voting on this plan has closed"), so those pass through;
// anything else keeps the caller's connection-style fallback. A name clash is
// singled out because the fix is on the person's side: pick another name.

type RpcError = { code?: string; message?: string } | null | undefined;

export type ParticipantFailure = { notice: string; nameTaken: boolean };

export const NAME_TAKEN_NOTICE =
  "Someone on this plan already goes by that name. Add an initial so the group can tell you apart.";

export function participantFailure(error: RpcError, fallback: string): ParticipantFailure {
  const message = error?.message ?? "";
  if (message.includes("name is already in use")) return { notice: NAME_TAKEN_NOTICE, nameTaken: true };
  if ((error?.code === "22023" || error?.code === "40001") && message) return { notice: message, nameTaken: false };
  return { notice: fallback, nameTaken: false };
}
