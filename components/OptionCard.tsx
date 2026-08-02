"use client";

import type { Spot } from "@/lib/types";

interface OptionCardProps {
  spot: Spot;
  yesCount: number;
  voted: boolean; // has the current voter said yes?
  isWinner: boolean;
  decided: boolean; // plan is settled — voting closed
  onToggle: () => void;
}

export default function OptionCard({
  spot,
  yesCount,
  voted,
  isWinner,
  decided,
  onToggle,
}: OptionCardProps) {
  const dimmed = decided && !isWinner;

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={decided}
      aria-pressed={voted}
      className={[
        "opt token relative rounded-[20px] border-2 bg-card p-4 text-left",
        "disabled:cursor-default",
        isWinner
          ? "border-punch [--tw-shadow-color:var(--color-punch)] z-[3]"
          : "border-ink",
        dimmed ? "opacity-55" : "",
      ].join(" ")}
      // token shadow color follows the winner state
      style={{ boxShadow: `5px 6px 0 ${isWinner ? "var(--color-punch)" : "var(--color-ink)"}` }}
    >
      {/* Winner rosette — the signature stamp */}
      <svg
        viewBox="0 0 100 100"
        aria-hidden="true"
        className={[
          "absolute -right-3 -top-3 h-16 w-16 drop-shadow-md",
          isWinner ? "rosette rosette-show" : "hidden",
        ].join(" ")}
      >
        <circle cx="50" cy="42" r="30" fill="#ff2e88" />
        <circle
          cx="50"
          cy="42"
          r="30"
          fill="none"
          stroke="#ffce2e"
          strokeWidth="4"
          strokeDasharray="6 6"
        />
        <path d="M40 70 L34 96 L50 86 L66 96 L60 70Z" fill="#6b34e0" />
        <text
          x="50"
          y="50"
          fontFamily="var(--font-bricolage), sans-serif"
          fontWeight="800"
          fontSize="26"
          fill="#fff"
          textAnchor="middle"
        >
          ★
        </text>
      </svg>

      <div className="font-display text-lg font-extrabold tracking-tight">
        {spot.name}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {[spot.area, spot.cuisine, spot.price_band].map((t) => (
          <span
            key={t}
            className="rounded-full bg-ink/[0.07] px-2 py-0.5 text-xs font-semibold text-muted"
          >
            {t}
          </span>
        ))}
      </div>

      <p className="mt-2.5 text-sm text-muted">{spot.vibe}</p>
      <p className="mt-1 text-xs text-muted">
        Open till {spot.open_till} · from AED {spot.min_spend}pp
      </p>

      <div className="mt-3 flex items-center justify-between">
        <span
          className={[
            "inline-flex items-center gap-1.5 text-sm font-bold tabular-nums",
            yesCount > 0 ? "text-mint" : "text-muted",
          ].join(" ")}
        >
          <span
            className={[
              "h-2 w-2 rounded-full",
              yesCount > 0 ? "bg-mint" : "bg-muted/40",
            ].join(" ")}
          />
          {yesCount} yes
        </span>

        {!decided && (
          <span
            className={[
              "rounded-full px-3 py-1 text-xs font-bold",
              voted
                ? "bg-mint text-white"
                : "border-2 border-ink/15 text-ink",
            ].join(" ")}
          >
            {voted ? "You're in ✓" : "I'm in"}
          </span>
        )}
      </div>
    </button>
  );
}
