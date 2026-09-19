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
  /** Most yes-votes in this round, and not a tie. Drives the After Dark sheen. */
  isLeader: boolean;
  decided: boolean; // plan is settled — voting closed
  distanceKm?: number | null;
  /** The plan's per-person ceiling, when it set one. Lets a chip say the
   *  place fits the group's budget rather than just naming a price. */
  budgetPerPerson?: number | null;
  onToggle: () => void;
}

export default function OptionCard({
  spot,
  voters,
  yesCount,
  voted,
  isWinner,
  isLeader,
  decided,
  distanceKm,
  budgetPerPerson,
  onToggle,
}: OptionCardProps) {
  const dimmed = decided && !isWinner;
  const cat = categoryMeta(spot.category);

  // Derived during render, not in an effect — React 19 lints setState-in-effect,
  // and there is nothing async here to justify one.
  const reasons: string[] = [];
  if (budgetPerPerson != null && spot.min_spend <= budgetPerPerson) {
    // Only claim "fits" when the number actually clears the group's ceiling.
    // Saying it otherwise would be the UI asserting something untrue.
    reasons.push(`Fits AED ${budgetPerPerson}`);
  } else {
    reasons.push(`From AED ${spot.min_spend}pp`);
  }
  if (distanceKm != null) reasons.push(`${Math.max(1, Math.round(distanceKm))} km away`);
  if (spot.open_till) reasons.push(`Open till ${spot.open_till}`);

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

      {/* Category strip: compact typographic code + type, in champagne metal.
          One line, always. Real cuisines ("Coffee & healthy") wrapped this to
          three and four lines, which pushed the heading and the Select button
          of one card 16px below its neighbours' — measured, not guessed. The
          chip truncates instead; the name and blurb below carry the meaning.

          "leading" moved OUT of this chip. Category marks IDENTITY and must
          never carry state (design-standards), and this chip was doing both.
          It now sits with the price, where the card's other at-a-glance facts
          are, and stops lengthening the category line. */}
      <div className="flex items-center justify-between gap-2">
        <span className="vote-option__category inline-flex min-w-0 items-center gap-1.5 px-2.5 py-1 text-xs font-bold">
          <span aria-hidden="true">{cat.code}</span>
          <span className="vote-option__cuisine">{spot.cuisine}</span>
        </span>
        {/* Nothing else on this row. The price band ($$/$$$) is gone — it said
            the same thing as the "Fits AED 500" chip below, less precisely.
            "leading" moved to the votes row, because that is what it is about.
            Top row is identity; the bottom row is state. Splitting them is
            what lets the cuisine read in full instead of truncating. */}
      </div>

      <h3 className="mt-2.5 font-display text-lg font-extrabold leading-tight tracking-tight">
        {spot.name}
      </h3>
      <p className="mt-0.5 text-xs font-medium text-muted">{spot.area}</p>

      {/* The "review" blurb — why you'd go */}
      <p className="mt-2 text-sm leading-snug text-ink/80">
        {spot.description ?? spot.vibe}
      </p>

      {/* Why THIS place, not just what it is. Same three values the grey
          caption used to run together — the change is that each one is now
          framed as a reason the group can check against, which is the whole
          claim the product makes ("nine that fit you"). Facts the app has
          only; nothing inferred, nothing invented. */}
      <ul className="vote-option__reasons mt-2 flex flex-wrap gap-1.5" aria-label="Why this place">
        {reasons.map((reason, i) => (
          <li
            key={reason}
            className="vote-option__reason px-2 py-0.5 text-xs font-medium"
            // Stagger is decorative and short (45ms), per the motion rules.
            // Index-based delay is safe: the list is at most three items and
            // is rebuilt whenever the spot changes.
            style={{ ["--reason-delay" as string]: `${i * 45}ms` }}
          >
            {reason}
          </li>
        ))}
      </ul>

      {/* State, on its own line. It went through the category chip (wrapped it
          to four lines) and the votes row (pushed Select outside the card at
          255px) before landing here. The row below is bottom-anchored, so this
          line costs the leading card nothing in alignment — every Select still
          sits on the same baseline. The leader border says this in shape; this
          is its text half, since shape is never allowed to be the only signal. */}
      {isLeader && !decided && (
        <p className="mt-2">
          <span className="vote-option__leading">leading</span>
        </p>
      )}

      {/* mt-auto, not mt-3: pins the action row to the card's bottom edge so
          uneven content above can never stagger the Select buttons again. */}
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
