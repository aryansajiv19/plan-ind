"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { avatarStyle, initialsOf } from "@/lib/avatar";
import { whenLabel } from "@/lib/when";
import { usePlanTimes } from "@/hooks/use-plan-times";
import type { Seat } from "@/lib/tally";

// P21: "Which times work for you?" A tick is your vote, so it takes the live
// accent like a picked card; faces say who else can make each time. At the
// decision, the most-ticked time becomes the plan's time (073).
export default function WhenPoll({ planId, seatKey, roster }: { planId: string; seatKey: string | null; roster: Seat[] }) {
  const { times, setAvailable } = usePlanTimes(planId, true);
  const [error, setError] = useState<string | null>(null);
  const unsaved = useSearchParams().get("when") === "unsaved";

  if (times.state === "loading") return null;
  if (times.state === "failed") return <p className="mt-3 text-sm text-muted">The time poll didn’t load. Refresh to try again.</p>;
  if (times.options.length === 0) {
    return unsaved ? <p className="mt-3 text-sm text-muted" role="status">Your times didn’t save. Set the time once the place is decided.</p> : null;
  }

  // Seat keys on rows are "s:<seat_key>" in the roster; yours is you.
  const nameOf = (seat: string) => (seat === seatKey ? roster.find((s) => s.you)?.name : roster.find((s) => s.key === `s:${seat}`)?.name);
  const counts = times.options.map((option) => times.votes.filter((vote) => vote.option_id === option.id).length);
  const most = Math.max(...counts);
  const leader = most > 0 && counts.filter((n) => n === most).length === 1 ? counts.indexOf(most) : -1;

  return (
    <section className="mt-4" aria-labelledby="when-poll-title">
      <p id="when-poll-title" className="text-xs font-bold uppercase tracking-wide text-muted">Which times work for you?</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {times.options.map((option, i) => {
          const seats = times.votes.filter((vote) => vote.option_id === option.id).map((vote) => vote.seat_key);
          const mine = seatKey != null && seats.includes(seatKey);
          const names = seats.map(nameOf).filter((name): name is string => Boolean(name));
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={mine}
              disabled={!seatKey}
              onClick={async () => {
                setError(null);
                const failure = await setAvailable(option.id, !mine, seatKey!);
                if (failure) setError(failure);
              }}
              className="flex min-h-11 items-center justify-between gap-3 rounded-[var(--radius-control)] border border-line bg-card px-3 py-2 text-left text-sm transition-colors duration-150 aria-pressed:border-[var(--color-live)] aria-pressed:bg-[color-mix(in_srgb,var(--color-live)_8%,var(--color-card))] disabled:cursor-default"
            >
              <span className="min-w-0">
                <span className="block font-semibold">{whenLabel(option.starts_at)}</span>
                <span className="block text-xs text-muted">
                  {seats.length === 0 ? "Nobody yet" : `${seats.length} can make it`}
                  {i === leader ? " · best so far" : ""}
                </span>
              </span>
              <span className="inline-flex items-center gap-2">
                {names.length > 0 && (
                  <span className="vote-face-stack" aria-hidden="true">
                    {names.slice(-4).map((name) => <span key={name} style={avatarStyle(name)}>{initialsOf(name)}</span>)}
                  </span>
                )}
                <span className={`text-xs font-bold ${mine ? "text-[var(--color-live)]" : "text-muted"}`}>{mine ? "Works for you" : "Tick"}</span>
              </span>
            </button>
          );
        })}
      </div>
      {error && <p className="mt-2 text-sm" role="alert">{error}</p>}
    </section>
  );
}

/** On the decided screen: how many could make the time the group landed on. */
export function WhenChosen({ planId, eventTime }: { planId: string; eventTime: string | null }) {
  const { times } = usePlanTimes(planId, false);
  if (!eventTime || times.state !== "ready") return null;
  const chosen = times.options.find((option) => Date.parse(option.starts_at) === Date.parse(eventTime));
  if (!chosen) return null;
  const ticks = times.votes.filter((vote) => vote.option_id === chosen.id).length;
  return <p className="mt-1 text-sm text-muted">From the time poll: {ticks === 1 ? "1 person" : `${ticks} people`} said this works.</p>;
}
