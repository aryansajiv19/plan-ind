import type { Plan } from "@/lib/types";

/** 075: claim_booking / release_booking, from any member of a decided plan. */
export type BookingAction = "claim" | "release";

export type BookingOutcome = {
  /** What the server says the plan now holds, applied before Realtime echoes it. */
  patch: Partial<Pick<Plan, "booking_owner" | "booked">> | null;
  /** Why nothing changed, in words; null when it did what was asked. */
  note: { text: string; profileLink?: true } | null;
};

/**
 * Maps a booking RPC's `{ result, booking_owner }` to what the screen shows.
 * Each refusal says its own reason (taken ≠ booked ≠ not decided), and an
 * unknown or missing result is a failure, never a silent success.
 */
export function bookingOutcome(action: BookingAction, data: unknown): BookingOutcome {
  const raw = (data && typeof data === "object" ? data : {}) as { result?: unknown; booking_owner?: unknown };
  const owner = typeof raw.booking_owner === "string" && raw.booking_owner ? raw.booking_owner : null;
  switch (raw.result) {
    case "claimed":
      return { patch: { booking_owner: owner }, note: null };
    case "released":
      return { patch: { booking_owner: null }, note: null };
    case "taken":
      return { patch: { booking_owner: owner }, note: { text: owner ? `${owner} got there first and is booking it.` : "Someone else is booking it already." } };
    case "not_yours":
      return { patch: { booking_owner: owner }, note: { text: owner ? `${owner} is booking it now.` : "The booking isn’t yours any more." } };
    case "booked":
      return { patch: { booked: true, booking_owner: owner }, note: { text: "It’s booked already, so it stays as it is." } };
    case "not_decided":
      return { patch: null, note: { text: "Nothing to book until the group picks a place." } };
    case "no_profile":
      return { patch: null, note: { text: "Add your name first, so the group knows who’s booking.", profileLink: true } };
    case "not_member":
      return { patch: null, note: { text: "You’re not in this plan any more." } };
    case "not_found":
      return { patch: null, note: { text: "This plan doesn’t exist any more." } };
    default:
      return { patch: null, note: { text: action === "claim" ? "Couldn’t take the booking. Try again." : "Couldn’t hand the booking back. Try again." } };
  }
}
