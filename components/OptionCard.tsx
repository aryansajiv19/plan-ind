"use client";

import { useEffect, useRef, useState } from "react";
import CountUp from "@/components/CountUp";
import { avatarStyle, initialsOf } from "@/lib/avatar";
import type { Spot } from "@/lib/types";
import { categoryMeta } from "@/lib/categories";

interface OptionCardProps {
  spot: Spot;
  /** Everyone who picked this place in the current round, newest last. */
  voters: string[];
  yesCount: number;
  voted: boolean; // has the current voter said yes?
  isWinner: boolean;
  decided: boolean; // plan is settled — voting closed
  distanceKm?: number | null;
  onToggle: () => void;
}

export default function OptionCard({
  spot,
  voters,
  yesCount,
  voted,
  isWinner,
  decided,
  distanceKm,
  onToggle,
}: OptionCardProps) {
  const dimmed = decided && !isWinner;
  const cat = categoryMeta(spot.category);

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
      disabled={decided}
      aria-pressed={voted}
      className={[
        "opt vote-option relative flex w-full flex-col bg-card p-4 text-left",
        "disabled:cursor-default",
        isWinner ? "vote-option--winner z-[3]" : "",
        dimmed ? "opacity-55" : "",
      ].join(" ")}
    >
      {isWinner && <span className="vote-option__winner-label">Selected</span>}

      {/* Category strip: compact typographic code + type, in champagne metal. */}
      <div className="flex items-center justify-between gap-2">
        <span className="vote-option__category inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold">
          <span aria-hidden="true">{cat.code}</span>
          {spot.cuisine}
        </span>
        <span className="vote-option__price px-2 py-0.5 text-xs font-semibold text-muted">
          {spot.price_band}
        </span>
      </div>

      <h3 className="mt-2.5 font-display text-lg font-extrabold leading-tight tracking-tight">
        {spot.name}
      </h3>
      <p className="mt-0.5 text-xs font-medium text-muted">{spot.area}</p>

      {/* The "review" blurb — why you'd go */}
      <p className="mt-2 text-sm leading-snug text-ink/80">
        {spot.description ?? spot.vibe}
      </p>

      <p className="mt-2 text-xs text-muted">
        Open till {spot.open_till} · from AED {spot.min_spend}pp{distanceKm != null ? ` · ${Math.max(1, Math.round(distanceKm))} km away` : ""}
      </p>

      <div className="mt-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-2">
          {/* Who picked this. Faces rather than a number: a count says how
              many, a face says who — and "who" is the whole reason a group
              is looking at this screen together. */}
          {voters.length > 0 && (
            <span className="vote-face-stack" aria-hidden="true">
              {voters.slice(-4).map((name) => (
                <span
                  key={name}
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
              <CountUp value={yesCount} /> yes
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
