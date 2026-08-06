"use client";

import type { Spot } from "@/lib/types";
import { categoryMeta } from "@/lib/categories";

interface OptionCardProps {
  spot: Spot;
  yesCount: number;
  voted: boolean; // has the current voter said yes?
  isWinner: boolean;
  decided: boolean; // plan is settled — voting closed
  distanceKm?: number | null;
  onToggle: () => void;
}

export default function OptionCard({
  spot,
  yesCount,
  voted,
  isWinner,
  decided,
  distanceKm,
  onToggle,
}: OptionCardProps) {
  const dimmed = decided && !isWinner;
  const cat = categoryMeta(spot.category);

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

      {/* Category strip: compact typographic code + type in the category accent. */}
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
        <span
          className={[
            "inline-flex items-center gap-1.5 text-sm font-bold tabular-nums",
            yesCount > 0 ? "vote-option__votes" : "text-muted",
          ].join(" ")}
        >
          {yesCount} yes
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
