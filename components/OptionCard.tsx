"use client";

import { useEffect, useRef, useState } from "react";
import CountUp from "@/components/CountUp";
import { avatarStyle, initialsOf } from "@/lib/avatar";
import type { Spot } from "@/lib/types";
import { categoryMeta } from "@/lib/categories";
import type { DealReason } from "@/lib/deal-reasons";
import { hoursLabel, openStatus } from "@/lib/open-hours";
import { metroFor } from "@/lib/dubai-metro";
import type { Coordinates } from "@/lib/dubai-areas";
import { driveMinutesEstimate, haversineKm } from "@/lib/directions";
import { useMinuteClock } from "@/hooks/use-minute-clock";

interface OptionCardProps {
  spot: Spot;
  /** Everyone who picked this place in the current round, newest last. */
  voters: string[];
  yesCount: number;
  voted: boolean; // has the current voter said yes?
  isWinner: boolean;
  /** Most yes-votes in this round, and not a tie. Drives the After Dark sheen. */
  isLeader: boolean;
  decided: boolean; // plan is settled — voting closed
  /** The deadline passed and the plan hasn't moved on yet: look, don't touch. */
  closed?: boolean;
  distanceKm?: number | null;
  /** P18: this voter's own origin. Replaces the host-based distance. */
  viewerFrom?: Coordinates | null;
  /** "Why this?" chips from `dealReasons()`. Omitted means none render. */
  reasons?: readonly DealReason[];
  onToggle: () => void;
}

// "· 9 km · ≈ 25 min drive" from this voter's own origin (P18).
function yourTrip(km: number): string {
  const drive = driveMinutesEstimate(km);
  return ` · ${Math.max(1, Math.round(km))}\u00a0km${drive != null ? ` · ≈\u00a0${drive}\u00a0min drive` : ""}`;
}

export default function OptionCard({
  spot,
  voters,
  yesCount,
  voted,
  isWinner,
  isLeader,
  decided,
  closed = false,
  distanceKm,
  viewerFrom = null,
  reasons: dealtReasons,
  onToggle,
}: OptionCardProps) {
  const dimmed = decided && !isWinner;
  const cat = categoryMeta(spot.category);
  // The distance chip carries the km itself; saying it twice is clutter.
  const fromYou = viewerFrom && spot.latitude != null && spot.longitude != null
    ? haversineKm(viewerFrom.latitude, viewerFrom.longitude, spot.latitude, spot.longitude) : null;
  // Your own distance wins over the host-based chip, so the card never shows two.
  const reasons = fromYou != null ? dealtReasons?.filter((reason) => reason.kind !== "distance") : dealtReasons;
  const shownKm = reasons?.some((reason) => reason.kind === "distance") ? null : distanceKm;
  // The vote is for later, so "Closed now" would mislead a card; only the
  // last hour before closing (which also proves it is open) replaces the
  // listing, so the meta line stays one line.
  const now = useMinuteClock();
  const status = now ? openStatus(spot.open_till, now) : null;
  const hours = status?.kind === "closing-soon" ? status.label : hoursLabel(spot.open_till);
  // P17: a walkable metro station is worth a word on the card; none isn't.
  const near = metroFor(spot);

  // A vote arriving over realtime is the only "someone else is here" signal
  // this screen has. Acknowledge it once, then clear — a permanent highlight
  // would just become another colour, and a loop is forbidden by the
  // standards. Skipped on first render so nothing flashes on load.
  const [bumped, setBumped] = useState(false);
  const previousCount = useRef<number | null>(null);
  useEffect(() => {
    const seen = previousCount.current;
    previousCount.current = yesCount;
    if (seen === null || seen === yesCount) return;
    setBumped(true);
    const timer = setTimeout(() => setBumped(false), 460);
    return () => clearTimeout(timer);
  }, [yesCount]);

  // Which names are new since the last render. Only those animate in — a
  // re-render for any other reason must not replay the whole stack.
  const [arriving, setArriving] = useState<string[]>([]);
  const previousVoters = useRef<string[] | null>(null);
  useEffect(() => {
    const seen = previousVoters.current;
    previousVoters.current = voters;
    if (seen === null) return; // first paint: everyone is already here
    const fresh = voters.filter((name) => !seen.includes(name));
    if (fresh.length === 0) return;
    setArriving(fresh);
    const timer = setTimeout(() => setArriving([]), 520);
    return () => clearTimeout(timer);
  }, [voters]);

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={decided || closed}
      aria-pressed={voted}
      className={[
        // `token` is the signature offset shadow — the card sits on the page
        // and sinks under a press. See the block at the top of globals.css.
        "opt token vote-option relative flex w-full flex-col bg-card p-4 text-left",
        "disabled:cursor-default",
        isWinner ? "vote-option--winner z-[3]" : "",
        isLeader && !decided ? "vote-option--leader" : "",
        dimmed ? "opacity-55" : "",
      ].join(" ")}
    >
      {isWinner && <span className="vote-option__winner-label">Selected</span>}

      {/* Category strip: identity only, one line. The cuisine truncates rather
          than wrapping ("Coffee & healthy" pushed one card's Select 16px below
          its neighbours'). No price band: the meta line says the AED figure. */}
      <span className="vote-option__category inline-flex min-w-0 items-center gap-1.5 self-start px-2.5 py-1 text-xs font-bold">
        <span aria-hidden="true">{cat.code}</span>
        <span className="vote-option__cuisine">{spot.cuisine}</span>
      </span>

      <h3 className="mt-2.5 font-display text-lg font-extrabold leading-tight tracking-tight">
        {spot.name}
      </h3>
      <p className="mt-0.5 text-xs font-medium text-muted">{spot.area}</p>

      {/* The "review" blurb — why you'd go */}
      <p className="mt-2 text-sm leading-snug text-ink/80">
        {spot.description ?? spot.vibe}
      </p>

      <p className="vote-option__meta mt-2 text-xs text-muted">
        {hours ? `${hours} · ` : ""}from AED {spot.min_spend}pp
        {fromYou != null ? yourTrip(fromYou) : shownKm != null ? ` · ${Math.max(1, Math.round(shownKm))} km away` : ""}
        {near?.walkable ? ` · Metro ≈\u00a0${near.walkMin}\u00a0min walk` : ""}
      </p>

      {/* Why the deal picked it. Spans, not a list: this sits inside a
          <button>, which only allows phrasing content. Hairline and muted,
          no hue: it explains, it is not state. */}
      {reasons && reasons.length > 0 && (
        <span className="mt-2 flex flex-wrap gap-1.5">
          <span className="sr-only">Why this: </span>
          {reasons.map((reason) => (
            <span key={reason.kind} className="rounded-full border border-line px-2 py-0.5 text-xs font-medium text-muted">
              {reason.label}
            </span>
          ))}
        </span>
      )}

      {/* State on its own line: category marks identity and never state. */}
      {isLeader && !decided && (
        <span className="mt-2 block">
          <span className="vote-option__leading">leading</span>
        </span>
      )}

      {/* mt-auto pins the action row to the card's bottom, so uneven content
          above can never stagger the Select buttons. */}
      <div className="mt-auto flex items-center justify-between pt-3">
        <span className="inline-flex items-center gap-2">
          {/* Who picked this. Faces rather than a number: a count says how
              many, a face says who — and "who" is the whole reason a group
              is looking at this screen together. */}
          {voters.length > 0 && (
            <span className="vote-face-stack" aria-hidden="true">
              {voters.slice(-4).map((name) => (
                <span
                  key={name}
                  data-face-name={name}
                  data-face-slot={spot.id}
                  style={avatarStyle(name)}
                  className={arriving.includes(name) ? "vote-face--arriving" : ""}
                >
                  {initialsOf(name)}
                </span>
              ))}
            </span>
          )}
          <span
            className={[
              "text-sm font-bold tabular-nums",
              yesCount > 0 ? "vote-option__votes" : "text-muted",
              bumped ? "vote-count--changed" : "",
            ].join(" ")}
          >
            {/* The names carry the meaning; screen readers get them here. */}
            <span className="sr-only">
              {voters.length > 0 ? `${voters.join(", ")} picked this` : "No votes yet"}
            </span>
            <span aria-hidden="true">
              <CountUp value={yesCount} />
              <span className="vote-option__votes-unit"> yes</span>
            </span>
          </span>
        </span>

        {!decided && (
          <span
            className={[
              "vote-option__choice px-3 py-1 text-xs font-bold",
              voted ? "vote-option__choice--selected" : "",
            ].join(" ")}
          >
            {voted ? "Selected" : "Select"}
          </span>
        )}
      </div>
    </button>
  );
}
