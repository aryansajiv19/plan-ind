import Link from "next/link";
import type { Plan, Spot } from "@/lib/types";
import type { BookingClaim } from "@/hooks/use-booking-claim";
import { googleCalUrl, icsHref } from "@/lib/calendar";

// The decided plan's booking and calendar links. Taking and handing back the
// booking is any member's (075: claim_booking / release_booking). Marking it
// booked stays the host's (patchPlan, which the server rejects for anyone
// else), so only the host is offered it.
export default function BookingSection({
  plan,
  winner,
  isHost,
  booking,
  onMarkBooked,
  onUnmarkBooked,
}: {
  plan: Plan;
  winner: Spot;
  isHost: boolean;
  booking: BookingClaim;
  onMarkBooked: () => void;
  onUnmarkBooked: () => void;
}) {
  // Client-only: this renders after the plan loads in the browser.
  const planUrl = `${typeof window === "undefined" ? "" : window.location.origin}/plan/${plan.id}`;
  const gcal = googleCalUrl(plan, winner, planUrl);
  const ics = icsHref(plan, winner, planUrl);

  return (
    <>
      <div className="mt-4 border-t border-line pt-4">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">
          Booking
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {plan.booked ? (
            <>
              <span className="vote-result__booked rounded-full bg-mint/15 px-3 py-1.5 text-sm font-bold text-mint">
                Booked{plan.booking_owner ? ` by ${plan.booking_owner}` : ""}
              </span>
              {/* "Mark as booked" had no way back: a mis-tap was permanent, and
                  reopening a plan requires it untaken. */}
              {isHost && (
                <button type="button" onClick={onUnmarkBooked} className="vote-result__button px-4 py-2 text-sm font-display">
                  Unmark booked
                </button>
              )}
            </>
          ) : plan.booking_owner ? (
            <>
              <span className="text-sm font-medium">
                {booking.mine ? "You’re booking it." : `${plan.booking_owner}’s booking it.`}
              </span>
              {isHost && (
                <button type="button" onClick={onMarkBooked} className="vote-result__button px-4 py-2 text-sm font-display">
                  Mark as booked
                </button>
              )}
              {booking.mine && (
                <button type="button" onClick={booking.release} disabled={booking.busy} className="vote-result__button px-4 py-2 text-sm font-display disabled:opacity-50">
                  I can’t book after all
                </button>
              )}
              {booking.mine && !isHost && <span className="text-sm text-muted">Once it’s booked, the host marks it here.</span>}
            </>
          ) : (
            <button type="button" onClick={booking.claim} disabled={booking.busy} className="vote-result__button px-4 py-2 text-sm font-display disabled:opacity-50">
              I’ll book it
            </button>
          )}
          {winner.booking_url && (
            <a
              href={winner.booking_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-bold text-grape underline"
            >
              Book a table
            </a>
          )}
        </div>
        {/* Present before it has words, so a refusal is announced when it lands. */}
        <p role="status" className="mt-2 text-sm empty:hidden">
          {booking.note?.text}
          {booking.note?.profileLink && <> <Link href="/home?view=profile" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">Add your name</Link></>}
        </p>
      </div>

      {/* Add to calendar */}
      {plan.event_time && (
        <div className="mt-4 flex flex-wrap gap-3 border-t border-line pt-4 text-sm font-bold">
          {gcal && (
            <a
              href={gcal}
              target="_blank"
              rel="noopener noreferrer"
              className="text-grape underline"
            >
              Add to Google Calendar
            </a>
          )}
          {ics && (
            <a href={ics} download={`${winner.name}.ics`} className="text-grape underline">
              Download .ics
            </a>
          )}
        </div>
      )}
    </>
  );
}
