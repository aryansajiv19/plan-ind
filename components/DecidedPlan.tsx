"use client";

import { useState } from "react";
import type { Plan, Rating, Rsvp, Spot } from "@/lib/types";
import { googleCalUrl, icsHref } from "@/lib/calendar";

interface DecidedPlanProps {
  plan: Plan;
  winner: Spot;
  voterName: string;
  rsvps: Rsvp[];
  ratings: Rating[];
  onSetTime: (iso: string) => void;
  onToggleRsvp: () => void;
  onClaimBooking: () => void;
  onMarkBooked: () => void;
  onRate: (partial: { stars?: number; again?: boolean }) => void;
}

// ISO (UTC) → the value a <input type="datetime-local"> expects (local wall time).
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function prettyTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function DecidedPlan({
  plan,
  winner,
  voterName,
  rsvps,
  ratings,
  onSetTime,
  onToggleRsvp,
  onClaimBooking,
  onMarkBooked,
  onRate,
}: DecidedPlanProps) {
  const [editingTime, setEditingTime] = useState(false);

  const coming = rsvps.filter((r) => r.coming);
  const imIn = coming.some((r) => r.voter_name === voterName);
  const gcal = googleCalUrl(plan, winner);
  const ics = icsHref(plan, winner);

  const myRating = ratings.find((r) => r.voter_name === voterName);
  const avgStars =
    ratings.length > 0
      ? ratings.reduce((s, r) => s + r.stars, 0) / ratings.length
      : 0;
  const againPct =
    ratings.length > 0
      ? Math.round(
          (ratings.filter((r) => r.again).length / ratings.length) * 100,
        )
      : 0;

  return (
    <div className="mt-6 rounded-2xl border-2 border-punch bg-punch/5 p-4 sm:p-5">
      <p className="font-display text-xl font-extrabold">It’s {winner.name}.</p>
      <p className="mt-1 text-sm text-muted">
        The group’s headed to {winner.area}. Now let’s make it happen.
      </p>

      {/* When */}
      <div className="mt-4 border-t border-line pt-4">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">When</p>
        {plan.event_time && !editingTime ? (
          <div className="mt-1 flex items-center justify-between gap-3">
            <p className="font-display text-lg font-extrabold">
              {prettyTime(plan.event_time)}
            </p>
            <button
              type="button"
              onClick={() => setEditingTime(true)}
              className="text-sm font-bold text-grape underline"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              type="datetime-local"
              defaultValue={plan.event_time ? toLocalInput(plan.event_time) : ""}
              onChange={(e) => {
                if (e.target.value) {
                  onSetTime(new Date(e.target.value).toISOString());
                  setEditingTime(false);
                }
              }}
              className="flex-1 rounded-xl border-2 border-ink bg-card px-3 py-2 font-medium outline-none"
            />
          </div>
        )}
      </div>

      {/* Who's in */}
      <div className="mt-4 border-t border-line pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted">
              Who’s in
            </p>
            <p className="mt-1 text-sm">
              {coming.length === 0 ? (
                <span className="text-muted">No one’s committed yet.</span>
              ) : (
                <span className="font-medium">
                  {coming.map((r) => r.voter_name).join(", ")}{" "}
                  <span className="text-muted">
                    ({coming.length} going)
                  </span>
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onToggleRsvp}
            aria-pressed={imIn}
            className={[
              "token shrink-0 rounded-xl border-2 border-ink px-4 py-2.5 font-display font-extrabold",
              imIn ? "bg-mint text-white" : "bg-card",
            ].join(" ")}
          >
            {imIn ? "You’re in ✓" : "I’m in"}
          </button>
        </div>
      </div>

      {/* Booking */}
      <div className="mt-4 border-t border-line pt-4">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">
          Booking
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {plan.booked ? (
            <span className="rounded-full bg-mint/15 px-3 py-1.5 text-sm font-bold text-mint">
              Booked ✓{plan.booking_owner ? ` by ${plan.booking_owner}` : ""}
            </span>
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
                  className="token rounded-xl border-2 border-ink bg-grape px-4 py-2 text-sm font-display font-extrabold text-white"
                >
                  Mark as booked
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={onClaimBooking}
              className="token rounded-xl border-2 border-ink bg-card px-4 py-2 text-sm font-display font-extrabold"
            >
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
              Book a table ↗
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

      {/* After the visit: rate it */}
      <div className="mt-4 border-t border-line pt-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">
            Been? Rate it
          </p>
          {ratings.length > 0 && (
            <p className="text-xs font-semibold text-muted tabular-nums">
              ★ {avgStars.toFixed(1)} · {ratings.length} rated · {againPct}% would go again
            </p>
          )}
        </div>

        <div className="mt-2 flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onRate({ stars: n })}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              aria-pressed={(myRating?.stars ?? 0) >= n}
              className="text-2xl leading-none"
              style={{ color: (myRating?.stars ?? 0) >= n ? "#ffce2e" : "var(--color-line)" }}
            >
              ★
            </button>
          ))}
          {myRating && (
            <span className="ml-1 text-sm text-muted">your rating</span>
          )}
        </div>

        {myRating && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm text-muted">Would you go again?</span>
            <button
              type="button"
              onClick={() => onRate({ again: true })}
              aria-pressed={myRating.again}
              className={[
                "rounded-full border-2 px-3 py-1 text-xs font-bold",
                myRating.again ? "border-ink bg-mint text-white" : "border-ink/15 text-ink",
              ].join(" ")}
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => onRate({ again: false })}
              aria-pressed={!myRating.again}
              className={[
                "rounded-full border-2 px-3 py-1 text-xs font-bold",
                !myRating.again ? "border-ink bg-ink text-white" : "border-ink/15 text-ink",
              ].join(" ")}
            >
              Not really
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
