"use client";

import { useState } from "react";
import type { Plan, Rating, Rsvp, Spot } from "@/lib/types";
import { googleCalUrl, icsHref } from "@/lib/calendar";
import { categoryMeta } from "@/lib/categories";
import WinnerPhotoReveal from "@/components/WinnerPhotoReveal";

interface DecidedPlanProps {
  plan: Plan;
  winner: Spot;
  voterName: string;
  /**
   * Whoever created the plan. onSetTime/onClaimBooking/onMarkBooked all
   * route through patchPlan, which the server (execute_plan_command) rejects
   * for anyone else — this only controls whether the UI *offers* those
   * controls, not whether they'd work if shown to a non-host.
   */
  isHost: boolean;
  rsvps: Rsvp[];
  ratings: Rating[];
  onSetTime: (iso: string) => void;
  onSetRsvp: (choice: "coming" | "maybe" | "no") => void;
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
  isHost,
  rsvps,
  ratings,
  onSetTime,
  onSetRsvp,
  onClaimBooking,
  onMarkBooked,
  onRate,
}: DecidedPlanProps) {
  const [editingTime, setEditingTime] = useState(false);
  const [copied, setCopied] = useState(false);
  const cat = categoryMeta(winner.category);

  const choiceFor = (r: Rsvp) => r.choice ?? (r.coming ? "coming" : "no");
  const coming = rsvps.filter((r) => choiceFor(r) === "coming");
  const mine = rsvps.find((r) => r.voter_name === voterName);
  const myChoice = mine ? choiceFor(mine) : null;

  async function copyForChat() {
    const line2 = [winner.area];
    if (plan.event_time) line2.push(prettyTime(plan.event_time));
    if (coming.length) line2.push(`${coming.length} in`);
    const text = [
      `We're going to ${winner.name}!`,
      line2.join(" · "),
      typeof window !== "undefined" ? window.location.href : "",
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (e.g. no focus / permissions) — don't claim success.
    }
  }
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
    <div className="vote-result mt-6 rounded-2xl border-2 border-punch bg-punch/5 p-4 sm:p-5">
      {/* SPECS.md §14.2: the winner's photo, assembling from scattered
          particles into itself — the reveal, not decoration on top of one.
          Only when a real photo exists; spot.photo_url is mostly null in
          the curated catalog today, and the existing category-badge
          treatment below already covers that honest-empty case. */}
      {winner.photo_url && (
        <WinnerPhotoReveal src={winner.photo_url} alt={`${winner.name}, ${winner.area}`} />
      )}

      {/* Decision summary */}
      <div className="flex items-center gap-3">
        <span
          className="vote-result__category grid h-12 w-12 shrink-0 place-items-center rounded-xl text-2xl"
          aria-hidden="true"
        >
          {cat.code}
        </span>
        <div>
          <p className="vote-kicker text-xs font-bold uppercase tracking-wide">
            Decided · you’re going
          </p>
          <p className="font-display text-xl font-extrabold leading-tight">
            It’s {winner.name}.
          </p>
        </div>
      </div>
      <p className="mt-2 text-sm text-muted">
        The group’s headed to {winner.area}. Now let’s make it happen.
      </p>

      <button
        type="button"
        onClick={copyForChat}
        className="vote-result__primary mt-3 w-full px-5 py-3 font-display"
      >
        {copied ? "Copied. Paste it in the chat" : "Copy for the group chat"}
      </button>

      {/* When */}
      <div className="mt-4 border-t border-line pt-4">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">When</p>
        {plan.event_time && !editingTime ? (
          <div className="mt-1 flex items-center justify-between gap-3">
            <p className="font-display text-lg font-extrabold">
              {prettyTime(plan.event_time)}
            </p>
            {isHost && (
              <button
                type="button"
                onClick={() => setEditingTime(true)}
                className="text-sm font-bold text-grape underline"
              >
                Change
              </button>
            )}
          </div>
        ) : isHost ? (
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
              className="vote-field flex-1 rounded-xl border-2 border-ink bg-card px-3 py-2 font-medium outline-none"
            />
          </div>
        ) : (
          <p className="mt-1 text-sm text-muted">Not set yet. Ask the host to add a time.</p>
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
          <div className="vote-rsvp-choices" aria-label="Your attendance choice">
            {(["coming", "maybe", "no"] as const).map((choice) => (
              <button key={choice} type="button" onClick={() => onSetRsvp(choice)} aria-pressed={myChoice === choice} className="vote-result__button">
                {choice === "coming" ? "Coming" : choice === "maybe" ? "Maybe" : "Can’t make it"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Booking */}
      <div className="mt-4 border-t border-line pt-4">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">
          Booking
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {plan.booked ? (
            <span className="vote-result__booked rounded-full bg-mint/15 px-3 py-1.5 text-sm font-bold text-mint">
              Booked{plan.booking_owner ? ` by ${plan.booking_owner}` : ""}
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

      {/* After the visit: rate it */}
      <div className="mt-4 border-t border-line pt-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">
            Been? Rate it
          </p>
          {ratings.length > 0 && (
            <p className="text-xs font-semibold text-muted tabular-nums">
              {avgStars.toFixed(1)} / 5 · {ratings.length} rated · {againPct}% would go again
            </p>
          )}
        </div>

        <div className="mt-2 flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onRate({ stars: n })}
              aria-label={`Rate ${n} out of 5`}
              aria-pressed={(myRating?.stars ?? 0) >= n}
              className="vote-rating-button"
            >
              {n}
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
                "vote-toggle",
                myRating.again ? "vote-toggle--on" : "",
              ].join(" ")}
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => onRate({ again: false })}
              aria-pressed={!myRating.again}
              className={[
                "vote-toggle",
                !myRating.again ? "vote-toggle--on" : "",
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
