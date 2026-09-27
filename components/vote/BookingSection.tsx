import type { Plan, Spot } from "@/lib/types";
import { googleCalUrl, icsHref } from "@/lib/calendar";

// The decided plan's booking claim and calendar links. The booking
// callbacks route through patchPlan, which the server rejects for anyone
// but the host; isHost only decides what is offered.
export default function BookingSection({
  plan,
  winner,
  voterName,
  isHost,
  onClaimBooking,
  onMarkBooked,
  onUnmarkBooked,
}: {
  plan: Plan;
  winner: Spot;
  voterName: string;
  isHost: boolean;
  onClaimBooking: () => void;
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
                {plan.booking_owner === voterName
                  ? "You’re booking it."
                  : `${plan.booking_owner}’s booking it.`}
              </span>
              {plan.booking_owner === voterName && (
                <button
                  type="button"
                  onClick={onMarkBooked}
                  className="vote-result__button px-4 py-2 text-sm font-display"
                >
                  Mark as booked
                </button>
              )}
            </>
          ) : isHost ? (
            <button
              type="button"
              onClick={onClaimBooking}
              className="vote-result__button px-4 py-2 text-sm font-display"
            >
              I’ll book it
            </button>
          ) : (
            <span className="text-sm text-muted">The plan host can book this.</span>
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
