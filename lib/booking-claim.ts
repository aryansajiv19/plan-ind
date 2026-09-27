import type { Plan } from "@/lib/types";

/** 075: claim_booking / release_booking / mark_booked, from any member of a decided plan. */
export type BookingAction = "claim" | "release" | "mark" | "unmark";

export type BookingOutcome = {
  /** The booking as the server now holds it, applied before Realtime echoes it. */
  patch: Partial<Pick<Plan, "booking_owner" | "booked">> | null;
  /** Why nothing changed, in words; null when it did what was asked. */
  note: { text: string; profileLink?: true } | null;
};

const FAILED: Record<BookingAction, string> = {
  claim: "Couldn’t take the booking. Try again.",
  release: "Couldn’t hand the booking back. Try again.",
  mark: "Couldn’t mark it booked. Try again.",
  unmark: "Couldn’t unmark it. Try again.",
};

/**
 * Maps a booking RPC's `{ result, booking_owner, booked }` to what the screen
 * shows. Every member-facing answer carries the plan's booking state after
 * the call, so any of them can patch the plan. Each refusal says its own
 * reason (taken ≠ booked ≠ not decided), and an unknown or missing result
 * is a failure, never a silent success.
 */
export function bookingOutcome(action: BookingAction, data: unknown): BookingOutcome {
  const raw = (data && typeof data === "object" ? data : {}) as { result?: unknown; booking_owner?: unknown; booked?: unknown };
  const state: NonNullable<BookingOutcome["patch"]> = {};
  if ("booking_owner" in raw) state.booking_owner = typeof raw.booking_owner === "string" && raw.booking_owner ? raw.booking_owner : null;
  if (typeof raw.booked === "boolean") state.booked = raw.booked;
  // Outsiders (not_found, not_member) get { result } only: nothing to apply.
  const patch = Object.keys(state).length > 0 ? state : null;
  const owner = state.booking_owner ?? null;
  const say = (text: string, profileLink?: true): BookingOutcome => ({ patch, note: profileLink ? { text, profileLink } : { text } });
  switch (raw.result) {
    case "claimed":
    case "released":
    case "marked":
    case "unmarked":
      return { patch, note: null };
    case "taken":
      return say(owner ? `${owner} got there first and is booking it.` : "Someone else is booking it already.");
    case "not_yours":
      return say(owner ? `${owner} is booking it now.` : "The booking isn’t yours any more.");
    case "booked":
      return say("It’s booked already, so it stays as it is.");
    case "not_holder":
      return say("Only whoever’s booking it, or the host, can mark it booked.");
    case "not_decided":
      return say("Nothing to book until the group picks a place.");
    case "no_profile":
      return say("Add your name first, so the group knows who’s booking.", true);
    case "not_member":
      return { patch: null, note: { text: "You’re not in this plan any more." } };
    case "not_found":
      return { patch: null, note: { text: "This plan doesn’t exist any more." } };
    default:
      return { patch: null, note: { text: FAILED[action] } };
  }
}
