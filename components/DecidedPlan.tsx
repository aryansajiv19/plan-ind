"use client";

import { useState } from "react";
import type { Plan, Rating, Rsvp, Spot } from "@/lib/types";
import { categoryMeta } from "@/lib/categories";
import { fitForEvent, hoursLabel } from "@/lib/open-hours";
import { dubaiMinuteOfDay } from "@/lib/dubai-phase";
import GettingThere from "@/components/vote/GettingThere";
import BookingSection from "@/components/vote/BookingSection";
import RatingSection from "@/components/vote/RatingSection";
import WhosInSection from "@/components/vote/WhosInSection";
import WinnerReveal from "@/components/WinnerReveal";
import PhotoCredit from "@/components/PhotoCredit";
import PlanWeather from "@/components/PlanWeather";
import { avatarStyle, initialsOf } from "@/lib/avatar";
import { shareMessage, type ShareWinner } from "@/lib/share-preview";
import ShareActions from "@/components/ShareActions";

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
  /** Everyone the plan can see, you first. A lower bound — see the vote page. */
  roster: string[];
  /** Who voted for the winner in the final round, sorted. */
  pickedBy: string[];
  onSetTime: (iso: string) => void;
  onSetRsvp: (choice: "coming" | "maybe" | "no") => void;
  onSetCarpool: (transport: Rsvp["transport"], seats: number | null) => void;
  onClaimBooking: () => void;
  onMarkBooked: () => void;
  /** Host only: take "booked" back off (a wrong tick, or before reopening). */
  onUnmarkBooked: () => void;
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
  roster,
  pickedBy,
  onSetTime,
  onSetRsvp,
  onSetCarpool,
  onClaimBooking,
  onMarkBooked,
  onUnmarkBooked,
  onRate,
}: DecidedPlanProps) {
  const [editingTime, setEditingTime] = useState(false);
  const [copied, setCopied] = useState(false);
  const cat = categoryMeta(winner.category);

  // One announcement for every share path: this button, WhatsApp and the
  // native sheet all send lib/share-preview's shareMessage.
  const shareWinner: ShareWinner = { name: winner.name, area: winner.area, eventTime: plan.event_time };

  async function copyForChat() {
    const text = shareMessage(plan.title, window.location.href, shareWinner);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (e.g. no focus / permissions) — don't claim success.
    }
  }

  // The listed closing time against the plan's start (Dubai clock). Only a
  // verdict is worth a line; a bare listing already sits in the details.
  const fit = plan.event_time ? fitForEvent(winner.open_till, new Date(plan.event_time)) : null;
  const fitWarns = fit?.kind === "tight" || fit?.kind === "after-close";
  const startDate = plan.event_time ? new Date(plan.event_time) : null;
  const viewerOffDubai = startDate != null
    && startDate.getHours() * 60 + startDate.getMinutes() !== dubaiMinuteOfDay(startDate);

  return (
    <div className="vote-result mt-6 rounded-2xl border-2 border-punch bg-punch/5 p-4 sm:p-5">
      {/* SPECS.md §14.2: the winner assembling from scattered particles.
          Ungated — it reconstructs the NAME, which every plan has, so it
          runs on every decided plan rather than the 7% with a photo. When
          there is a photo it still settles onto it. */}
      <WinnerReveal
        name={winner.name}
        photoUrl={winner.photo_url}
        alt={`${winner.name}, ${winner.area}`}
      />
      {/* Licence obligation — see PhotoCredit. Renders nothing without both
          a photo and an attribution. */}
      <PhotoCredit spot={winner} />

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
          {/* A count says how many; faces say who. No "of N": the roster
              is a lower bound. Legacy/tied plans can have no final votes. */}
          {pickedBy.length > 0 && (
            <p className="mt-1 inline-flex items-center gap-2 text-sm text-muted">
              <span className="vote-face-stack" aria-hidden="true">
                {pickedBy.slice(0, 8).map((name) => (
                  <span key={name} style={avatarStyle(name)}>{initialsOf(name)}</span>
                ))}
              </span>
              <span>Picked by {pickedBy.join(", ")}</span>
            </p>
          )}
        </div>
      </div>
      <p className="mt-2 text-sm text-muted">
        The group’s headed to {winner.area}. Now let’s make it happen.
      </p>
      {/* What the winner card used to carry, now that it no longer renders
          beside the reveal. */}
      <p className="vote-result__details mt-2 text-sm">
        {winner.description ?? winner.vibe}
        <span className="text-muted"> · {hoursLabel(winner.open_till) ?? "Hours not listed"} · from AED {winner.min_spend}pp</span>
      </p>

      <button
        type="button"
        onClick={copyForChat}
        className="vote-result__primary mt-3 w-full px-5 py-3 font-display"
      >
        {copied ? "Copied. Paste it in the chat" : "Copy for the group chat"}
      </button>
      <ShareActions title={plan.title} winner={shareWinner} />

      {/* When */}
      <div className="mt-4 border-t border-line pt-4">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">When</p>
        {plan.event_time && !editingTime ? (
          <>
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
          {/* The forecast at the venue for that hour. Renders nothing while
              loading, on failure, or with no venue coordinates. */}
          {winner.latitude != null && winner.longitude != null && (
            <PlanWeather latitude={winner.latitude} longitude={winner.longitude} at={plan.event_time} />
          )}
          {fit && fit.kind !== "listed" && (
            <p className={`mt-1 text-sm ${fitWarns ? "font-medium" : "text-muted"}`}>
              {fitWarns ? "Heads up: " : ""}{fit.label}{viewerOffDubai ? " (Dubai time)" : ""}
            </p>
          )}
          </>
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

      <WhosInSection rsvps={rsvps} roster={roster} voterName={voterName} onSetRsvp={onSetRsvp} onSetCarpool={onSetCarpool} />

      <GettingThere plan={plan} winner={winner} />

      <BookingSection
        plan={plan}
        winner={winner}
        voterName={voterName}
        isHost={isHost}
        onClaimBooking={onClaimBooking}
        onMarkBooked={onMarkBooked}
        onUnmarkBooked={onUnmarkBooked}
      />

      <RatingSection planId={plan.id} voterName={voterName} ratings={ratings} onRate={onRate} />
    </div>
  );
}
