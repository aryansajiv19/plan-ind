"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import CountUp from "@/components/CountUp";
import VenuePhoto, { useGooglePhotos } from "@/components/VenuePhoto";
import { hasVenuePhoto } from "@/lib/venue-photo";
import { avatarStyle, initialsOf } from "@/lib/avatar";
import type { Spot } from "@/lib/types";
import { categoryName } from "@/components/categoryGroups";
import { knownMinSpend } from "@/lib/price";
import type { DealReason } from "@/lib/deal-reasons";
import { hoursLabel, openStatus } from "@/lib/open-hours";
import { metroFor } from "@/lib/dubai-metro";
import { reopensLabel } from "@/lib/venue-facts";
// Aliased: `distanceKm` is also this card's prop (the distance from the host's origin).
import { distanceKm as straightLineKm, type Coordinates } from "@/lib/dubai-areas";
import { driveMinutesEstimate } from "@/lib/directions";
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

// "9 km · ≈ 25 min drive (estimate)" from this voter's own origin (P18):
// a straight-line guess (lib/directions.ts), said so as everywhere else.
function yourTrip(km: number): string {
  const drive = driveMinutesEstimate(km);
  return `${Math.max(1, Math.round(km))}\u00a0km${drive != null ? ` · ≈\u00a0${drive}\u00a0min drive (estimate)` : ""}`;
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
  // The chip says what kind of place in words: the cuisine, else the category.
  const kind = spot.cuisine || categoryName(spot.category);
  const fromYou = viewerFrom && spot.latitude != null && spot.longitude != null
    ? straightLineKm(viewerFrom, { latitude: spot.latitude, longitude: spot.longitude }) : null;
  // The fact line carries the distance, so the "Why this" reasons never repeat it.
  const trip = fromYou != null ? yourTrip(fromYou) : distanceKm != null ? `${Math.max(1, Math.round(distanceKm))} km away` : null;
  const reasons = dealtReasons?.filter((reason) => reason.kind !== "distance");
  // The vote is for later, so "Closed now" would mislead a card; only the
  // last hour before closing (which also proves it is open) replaces the
  // listing.
  const now = useMinuteClock();
  const status = now ? openStatus(spot.open_till, now) : null;
  const hours = status?.kind === "closing-soon" ? status.label : hoursLabel(spot.open_till);
  // P17: a walkable metro station is worth a word on the card; none isn't.
  const near = metroFor(spot);
  const reopens = reopensLabel(spot.reopens_on);
  const when = [hours, near?.walkable ? `Metro ≈\u00a0${near.walkMin}\u00a0min walk` : null].filter(Boolean).join(" · ");

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

  const photo = hasVenuePhoto(spot, useGooglePhotos());
  // No spend to state (a custom place), no spend shown.
  const spend = knownMinSpend(spot);
  const facts = [spend != null ? `from AED ${spend}pp` : null, trip].filter((fact): fact is string => fact != null);

  // P27: the card is an article, not one big button. A real Select button
  // carries the vote (its ::after stretches over the card, so the whole card
  // still takes the tap) and the name, so its accessible name is short.
  return (
    <article
      data-selected={voted ? "" : undefined}
      data-locked={decided || closed ? "" : undefined}
      className={[
        "opt token vote-option relative flex w-full flex-col bg-card text-left",
        isWinner ? "vote-option--winner z-[3]" : "",
        dimmed ? "opacity-55" : "",
      ].join(" ")}
    >
      {isWinner && <span className="vote-option__winner-label">Selected</span>}

      {/* A fixed band so every card in a row starts its text at the same
          line: the venue photo with the name set over it like a listing, or
          the name alone on the raised surface. */}
      <div className="vote-option__media">
        {photo ? (
          <>
            <VenuePhoto spot={spot} sizes="(min-width: 641px) 22rem, 85vw" />
            <div className="vote-option__overlay">
              <span className="vote-option__category self-start px-2 py-0.5 text-xs">{kind}</span>
              <div>
                <h3 className="vote-option__name">{spot.name}</h3>
                <p className="vote-option__where">{spot.area}</p>
              </div>
            </div>
          </>
        ) : (
          <div className="vote-option__type">
            <span className="vote-option__category self-start px-2.5 py-1 text-xs">{kind}</span>
            <h3 className="mt-auto text-balance font-display text-3xl font-semibold leading-[1.1] tracking-tight">{spot.name}</h3>
            <p className="mt-1 text-xs font-medium text-muted">{spot.area}</p>
          </div>
        )}
      </div>

      <div className="vote-option__body flex flex-1 flex-col p-4">
      {/* The one fact line: what it costs, how far, and whether it leads. */}
      <p className="vote-option__meta text-sm text-muted">
        {facts.map((fact, index) => (
          <Fragment key={fact}>{index > 0 ? " · " : null}<span>{fact}</span></Fragment>
        ))}
        {isLeader && !decided && <>{facts.length > 0 ? " · " : null}<span className="vote-option__leading">Leading</span></>}
      </p>

      {/* Everything else, one tap away: the card leads with the choice. */}
      <details className="vote-option__more">
        <summary>More</summary>
        {/* 070: closed since the deal, until a date. Never dealt again till then. */}
        {reopens && <p className="text-xs font-bold">{reopens}</p>}
        <p className="text-sm leading-snug text-ink/80">{spot.description ?? spot.vibe}</p>
        {when && <p className="text-xs text-muted">{when}</p>}
        {/* Why the deal picked it: one muted fact line. It explains; it is not state. */}
        {reasons && reasons.length > 0 && (
          <p className="text-xs font-semibold text-muted">
            <span className="sr-only">Why this: </span>
            {reasons.map((reason, index) => (
              <Fragment key={reason.kind}>{index > 0 ? " · " : null}<span>{reason.label}</span></Fragment>
            ))}
          </p>
        )}
      </details>
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
          <button
            type="button"
            onClick={onToggle}
            disabled={closed}
            aria-pressed={voted}
            className={[
              "vote-option__choice px-3 py-1 text-xs font-bold",
              voted ? "vote-option__choice--selected" : "",
            ].join(" ")}
          >
            {voted ? "Selected" : "Select"}
            <span className="sr-only"> {spot.name}</span>
          </button>
        )}
      </div>
      </div>
    </article>
  );
}
