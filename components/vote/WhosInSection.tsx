import type { Rsvp } from "@/lib/types";
import { seatKey, type Seat } from "@/lib/tally";
import { avatarStyle, initialsOf } from "@/lib/avatar";

export default function WhosInSection({
  rsvps,
  roster,
  isMine,
  onSetRsvp,
  onSetCarpool,
}: {
  rsvps: Rsvp[];
  /** Everyone the plan can see, you first. A lower bound — see the vote page. */
  roster: Seat[];
  /** This account's RSVP row (lib/my-rows.ts): names are not unique. */
  isMine: (rsvp: Rsvp) => boolean;
  onSetRsvp: (choice: "coming" | "maybe" | "no") => void;
  onSetCarpool: (transport: Rsvp["transport"], seats: number | null) => void;
}) {
  const choiceFor = (r: Rsvp) => r.choice ?? (r.coming ? "coming" : "no");
  const coming = rsvps.filter((r) => choiceFor(r) === "coming");
  const mine = rsvps.find(isMine);
  const myChoice = mine ? choiceFor(mine) : null;
  const rsvpOf = new Map(rsvps.map((r) => [seatKey(r), r]));
  const withChoice = (choice: "maybe" | "no") => rsvps.filter((r) => choiceFor(r) === choice).map((r) => r.voter_name);
  const carpoolNote = (r: Rsvp) =>
    r.transport === "driving"
      ? r.seats_available != null ? ` (driving · ${r.seats_available} ${r.seats_available === 1 ? "seat" : "seats"})` : " (driving)"
      : r.transport === "need_ride" ? " (needs a ride)" : "";

  // Same seats as the vote page: a face for everyone coming, an open seat for
  // everyone else the plan can see. The lines below name only what RSVPs
  // actually say — never "not answered: X", which would pass a lower-bound
  // roster off as the whole group.
  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted">
            Who’s in
          </p>
          {roster.length > 1 && (
            <ul className="vote-seats__row mt-2" aria-label="People on this plan">
              {roster.slice(0, 10).map(({ key, name, you }) => {
                const r = you ? mine : rsvpOf.get(key);
                const going = r ? choiceFor(r) === "coming" : false;
                return (
                  <li key={key} className="vote-seat" data-open={going ? undefined : "1"}>
                    <span aria-hidden="true" style={going ? avatarStyle(name) : undefined}>{initialsOf(name)}</span>
                    <span className="sr-only">
                      {name}, {r ? (choiceFor(r) === "coming" ? "coming" : choiceFor(r) === "maybe" ? "maybe" : "can’t make it") : "no RSVP"}
                    </span>
                  </li>
                );
              })}
              {roster.length > 10 && <li className="vote-seat vote-seat--more">+{roster.length - 10}</li>}
            </ul>
          )}
          <p className="mt-2 text-sm">
            {coming.length === 0 ? (
              <span className="text-muted">No one’s committed yet.</span>
            ) : (
              <span className="font-medium">
                <span className="text-muted">{coming.length} going: </span>
                {coming.map((r) => r.voter_name + carpoolNote(r)).join(", ")}
              </span>
            )}
          </p>
          {withChoice("maybe").length > 0 && (
            <p className="mt-1 text-sm text-muted">Maybe: {withChoice("maybe").join(", ")}</p>
          )}
          {withChoice("no").length > 0 && (
            <p className="mt-1 text-sm text-muted">Can’t make it: {withChoice("no").join(", ")}</p>
          )}
        </div>
        <div className="vote-rsvp-choices" aria-label="Your attendance choice">
          {(["coming", "maybe", "no"] as const).map((choice) => (
            <button key={choice} type="button" onClick={() => onSetRsvp(choice)} aria-pressed={myChoice === choice} className="vote-result__button">
              {choice === "coming" ? "Coming" : choice === "maybe" ? "Maybe" : "Can’t make it"}
            </button>
          ))}
        </div>
      </div>

      {/* Carpool (035). Only once you're coming — a ride is a commitment.
          Tapping your current option again clears it back to unset. */}
      {myChoice === "coming" && mine && (
        <div className="vote-carpool">
          <p id="carpool-label" className="text-xs font-bold uppercase tracking-wide text-muted">How you’re getting there</p>
          <div className="vote-rsvp-choices" role="group" aria-labelledby="carpool-label">
            {([["driving", "I’m driving"], ["need_ride", "Need a ride"], ["own_way", "Own way"]] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={mine.transport === value}
                className="vote-result__button"
                onClick={() => onSetCarpool(mine.transport === value ? null : value, value === "driving" ? mine.seats_available ?? null : null)}
              >
                {label}
              </button>
            ))}
          </div>
          {mine.transport === "driving" && (
            <label className="vote-carpool__seats">
              Spare seats
              <select
                className="vote-field"
                value={mine.seats_available ?? ""}
                onChange={(e) => onSetCarpool("driving", e.target.value === "" ? null : Number(e.target.value))}
              >
                <option value="">Not sure</option>
                {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n === 0 ? "Car’s full" : n}</option>)}
              </select>
            </label>
          )}
        </div>
      )}
    </div>
  );
}
