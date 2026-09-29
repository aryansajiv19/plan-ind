"use client";

import { useState } from "react";
import { avatarStyle, initialsOf } from "@/lib/avatar";
import type { Seat } from "@/lib/tally";

// Past this many seats the row stops reading as faces; the rest collapse to +N.
const SEAT_LIMIT = 10;

/**
 * §26.1: draw the group, not just the people who acted. A seat fills when
 * that person has picked this round. On the live page the roster is a LOWER
 * BOUND — plan_access carries no names, so someone who opened the link and
 * never acted is invisible — which is why the copy counts picks and never
 * claims "N of M".
 */
export default function VoteSeats({
  roster,
  picked,
  othersHere,
  onRemove,
}: {
  /** Everyone on the plan, one seat per person, you first. */
  roster: Seat[];
  /** Seat keys that have picked in the round on screen. */
  picked: ReadonlySet<string>;
  /** Other people with the plan open right now. */
  othersHere: string[];
  /** 080: the host's control; only seats with a seat key (an account) can go. */
  onRemove?: (seatKey: string) => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  return (
    <div className="vote-seats">
      <ul className="vote-seats__row" aria-label="People on this plan">
        {roster.slice(0, SEAT_LIMIT).map(({ key, name, you }) => {
          const done = picked.has(key);
          return (
            <li key={key} className="vote-seat" data-open={done ? undefined : "1"}>
              <span aria-hidden="true" data-face-name={name} data-face-slot="seat" style={done ? avatarStyle(name) : undefined}>
                {initialsOf(name)}
              </span>
              <span className="sr-only">
                {you ? `${name} (you)` : name}, {done ? "picked" : "not picked yet"}
              </span>
              {onRemove && !you && key.startsWith("s:") && (confirming === key ? (
                // Two steps: no un-remove exists (080), so one stray tap must not be final.
                <>
                  <button type="button" onClick={() => { setConfirming(null); onRemove(key.slice(2)); }}>Remove {name} for good</button>
                  <button type="button" onClick={() => setConfirming(null)}>Keep</button>
                </>
              ) : (
                <button type="button" onClick={() => setConfirming(key)} aria-label={`Remove ${name} from this plan`}>Remove</button>
              ))}
            </li>
          );
        })}
        {roster.length > SEAT_LIMIT && (
          <li className="vote-seat vote-seat--more">+{roster.length - SEAT_LIMIT}</li>
        )}
      </ul>
      <p className="vote-seats__summary">
        {picked.size} picked this round
        {othersHere.length > 0 && ` · Online now: ${othersHere.slice(0, 3).join(", ")}${othersHere.length > 3 ? ` +${othersHere.length - 3}` : ""}`}
      </p>
    </div>
  );
}
