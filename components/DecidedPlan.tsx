"use client";

import { useState } from "react";
import Link from "next/link";
import type { Plan, Rating, Rsvp, Spot } from "@/lib/types";
import type { Mine } from "@/lib/my-rows";
import type { Seat } from "@/lib/tally";
import { categoryMeta } from "@/lib/categories";
import { knownMinSpend } from "@/lib/price";
import { fitForEvent, hoursLabel } from "@/lib/open-hours";
import { dubaiMinuteOfDay, fromDubaiInput, toDubaiInput } from "@/lib/dubai-phase";
import GettingThere from "@/components/vote/GettingThere";
import KnowBeforeYouGo from "@/components/KnowBeforeYouGo";
import { WhenChosen } from "@/components/vote/WhenPoll";
import { reopensLabel } from "@/lib/venue-facts";
import BookingSection from "@/components/vote/BookingSection";
import RatingSection from "@/components/vote/RatingSection";
import WhosInSection from "@/components/vote/WhosInSection";
import WinnerReveal from "@/components/WinnerReveal";
import PlanWeather from "@/components/PlanWeather";
import { avatarStyle, initialsOf } from "@/lib/avatar";
import { shareMessage, type ShareWinner } from "@/lib/share-preview";
import ShareActions from "@/components/ShareActions";

interface DecidedPlanProps {
  plan: Plan;
  winner: Spot;
  voterName: string;
  /** Which rows are this account's (lib/my-rows.ts). */
  mine: Mine;
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
  roster: Seat[];
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

// Always Dubai wall time (P23): the venue's clock, whoever is looking.
function prettyTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Asia/Dubai",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default function DecidedPlan({
  plan,
  winner,
  voterName,
  mine,
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
  // P23: the time is a draft until Save; null means not editing. A host
  // with no time set yet edits straight away.
  const [timeDraft, setTimeDraft] = useState<string | null>(null);
  const editingTime = timeDraft !== null || (!plan.event_time && isHost);
  const draftIso = fromDubaiInput(timeDraft ?? "");
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
  const reopens = reopensLabel(winner.reopens_on);
  const fit = plan.event_time ? fitForEvent(winner.open_till, new Date(plan.event_time)) : null;
  const fitWarns = fit?.kind === "tight" || fit?.kind === "after-close";
  const startDate = plan.event_time ? new Date(plan.event_time) : null;
  const viewerOffDubai = startDate != null
    && startDate.getHours() * 60 + startDate.getMinutes() !== dubaiMinuteOfDay(startDate);

  // P11: rating opens once the outing has happened: its time, or three
  // hours after the decision when no time was set.
  const rateOpensAt = plan.event_time
    ?? (plan.decided_at ? new Date(Date.parse(plan.decided_at) + 3 * 3_600_000).toISOString() : null);

  return (
    <div className="vote-result mt-6 rounded-2xl border-2 border-punch bg-punch/5 p-4 sm:p-5">
      {/* SPECS.md §14.2: the winner assembling from scattered particles.
          Ungated — it reconstructs the NAME, which every plan has, so it
          runs on every decided plan rather than the 7% with a photo. When
          there is a photo it still settles onto it. */}
      <WinnerReveal name={winner.name} spot={winner} />

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
      {/* 070: a spot that closed after the plan dealt it. */}
      {reopens && <p className="mt-2 text-sm font-medium">Heads up: closed now. {reopens}.</p>}
      {/* What the winner card used to carry, now that it no longer renders
          beside the reveal. */}
      <p className="vote-result__details mt-2 text-sm">
        {winner.description ?? winner.vibe}
        <span className="text-muted"> · {hoursLabel(winner.open_till) ?? "Hours not listed"}{knownMinSpend(winner) != null ? ` · from AED ${winner.min_spend}pp` : ""} · </span>
        <Link href={`/place/${winner.id}?from=/plan/${plan.id}`}>Place details</Link>
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
              {prettyTime(plan.event_time)}{viewerOffDubai && <span className="text-sm font-medium text-muted"> Dubai time</span>}
            </p>
            {isHost && (
              <button
                type="button"
                onClick={() => setTimeDraft(toDubaiInput(plan.event_time!))}
                className="text-sm font-bold text-grape underline"
              >
                Change
              </button>
            )}
          </div>
          <WhenChosen planId={plan.id} eventTime={plan.event_time} />
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
          <form
            className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              if (!draftIso) return;
              onSetTime(draftIso);
              setTimeDraft(null);
            }}
          >
            <label className="flex flex-1 flex-col gap-1 text-sm font-medium">
              <span className="text-muted">Dubai time</span>
              <input
                type="datetime-local"
                value={timeDraft ?? ""}
                onChange={(event) => setTimeDraft(event.target.value)}
                className="vote-field min-h-11 rounded-xl border-2 border-ink bg-card px-3 py-2 font-medium outline-none"
              />
            </label>
            <button type="submit" disabled={!draftIso} className="min-h-11 rounded-xl border-2 border-ink bg-ink px-4 font-bold text-card disabled:opacity-50">
              Save time
            </button>
            {plan.event_time && (
              <button type="button" onClick={() => setTimeDraft(null)} className="min-h-11 px-2 text-sm font-bold text-muted underline">
                Cancel
              </button>
            )}
          </form>
        ) : (
          <p className="mt-1 text-sm text-muted">Not set yet. Ask the host to add a time.</p>
        )}
      </div>

      <WhosInSection rsvps={rsvps} roster={roster} isMine={mine.rsvp} onSetRsvp={onSetRsvp} onSetCarpool={onSetCarpool} />

      <BookingSection
        plan={plan}
        winner={winner}
        voterName={voterName}
        isHost={isHost}
        onClaimBooking={onClaimBooking}
        onMarkBooked={onMarkBooked}
        onUnmarkBooked={onUnmarkBooked}
      />

      <GettingThere plan={plan} winner={winner} />
      <KnowBeforeYouGo spot={winner} className="mt-4 border-t border-line pt-4" />


      <RatingSection planId={plan.id} spotId={winner.id} opensAt={rateOpensAt} isMine={mine.rating} ratings={ratings} onRate={onRate} />
    </div>
  );
}
