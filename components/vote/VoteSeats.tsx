import { avatarStyle, initialsOf } from "@/lib/avatar";

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
  voterName,
  picked,
  othersHere,
}: {
  /** Everyone on the plan, you first. */
  roster: string[];
  voterName: string;
  /** Names that have picked in the round on screen. */
  picked: ReadonlySet<string>;
  /** Other people with the plan open right now. */
  othersHere: string[];
}) {
  return (
    <div className="vote-seats">
      <ul className="vote-seats__row" aria-label="People on this plan">
        {roster.slice(0, SEAT_LIMIT).map((name) => {
          const done = picked.has(name);
          return (
            <li key={name} className="vote-seat" data-open={done ? undefined : "1"}>
              <span aria-hidden="true" data-face-name={name} data-face-slot="seat" style={done ? avatarStyle(name) : undefined}>
                {initialsOf(name)}
              </span>
              <span className="sr-only">
                {name === voterName ? `${name} (you)` : name}, {done ? "picked" : "not picked yet"}
              </span>
            </li>
          );
        })}
        {roster.length > SEAT_LIMIT && (
          <li className="vote-seat vote-seat--more">+{roster.length - SEAT_LIMIT}</li>
        )}
      </ul>
      <p className="vote-seats__summary">
        {picked.size} picked this round
        {othersHere.length > 0 && ` · ${othersHere.slice(0, 3).join(", ")}${othersHere.length > 3 ? " and others" : ""} here now`}
      </p>
    </div>
  );
}
