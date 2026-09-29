"use client";

import { useState } from "react";
import { useCrewMatch } from "@/hooks/use-crew-match";
import type { CategoryGroupKey, CrewMatch as Match, CrewStreak, PersonCard } from "@/lib/types";

// You and one friend (088): how aligned you are and where you split, from the
// plans you voted on together, the places you both ranked and the kinds of
// place you both go to; and how many months running you've been out together.
// Under three shared signals it says what unlocks it, never a thin number.
const GROUP_WORD: Record<CategoryGroupKey, string> = {
  food: "food",
  night: "nights out",
  water: "beach days",
  active: "sport",
  leisure: "culture and downtime",
};

const monthLabel = (ym: string) =>
  new Date(`${ym}-01T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

export function CrewMatchView({ name, match, streak }: { name: string; match: Match; streak: CrewStreak }) {
  const first = name.split(/\s+/)[0] || name;
  if (match.status === "not_enough") {
    const left = Math.max(1, match.needed - match.signals);
    return (
      <div className="crew__locked">
        <p>
          <strong>{left} more {left === 1 ? "plan" : "plans"} together</strong> to unlock your match with {first}.
        </p>
        <div className="crew__dots" aria-hidden="true">
          {Array.from({ length: match.needed }, (_, i) => <span key={i} data-done={i < match.signals || undefined} />)}
        </div>
        <Streak streak={streak} first={first} />
      </div>
    );
  }
  const parts = [
    match.parts.plans && { label: "Plan votes", value: match.parts.plans.agreement, note: `${match.parts.plans.rounds} rounds together` },
    match.parts.rankings && { label: "Place rankings", value: match.parts.rankings.agreement, note: "the places you both ranked" },
    match.parts.categories && { label: "Kinds of place", value: match.parts.categories.overlap, note: `${match.parts.categories.shared} you both go to` },
  ].filter((p): p is { label: string; value: number; note: string } => Boolean(p));

  return (
    <div className="crew__ready">
      <p className="crew__score">
        <strong>{match.score}%</strong>
        <span>aligned with {first}</span>
      </p>
      <ul className="crew__parts">
        {parts.map((p) => (
          <li key={p.label}>
            <div><span>{p.label}</span><strong>{p.value}%</strong></div>
            <progress value={p.value} max={100} aria-label={`${p.label}, ${p.value}%`} />
            <small>{p.note}</small>
          </li>
        ))}
      </ul>
      {match.biggest_split && <p className="crew__split">You split on {GROUP_WORD[match.biggest_split]}.</p>}
      <Streak streak={streak} first={first} />
    </div>
  );
}

function Streak({ streak, first }: { streak: CrewStreak; first: string }) {
  if (streak.months === 0) return <p className="crew__streak">Go out with {first} this month to start a streak.</p>;
  return (
    <p className="crew__streak">
      <strong>{streak.months}-month streak</strong>
      {streak.since && ` since ${monthLabel(streak.since)}`}
      {streak.this_month_open && `. One plan this month keeps it going.`}
    </p>
  );
}

export default function CrewMatch({ friends }: { friends: PersonCard[] }) {
  const [picked, setPicked] = useState<string | null>(null);
  const friendId = picked ?? friends[0]?.id ?? null;
  const read = useCrewMatch(friendId, friends.length > 0);
  if (friends.length === 0) return null;
  const friend = friends.find((f) => f.id === friendId)!;

  return (
    <section className="crew" aria-labelledby="crew-title">
      <h2 id="crew-title">Crew match</h2>
      <div className="crew__friends" role="group" aria-label="Friend">
        {friends.map((f) => (
          <button key={f.id} type="button" aria-pressed={f.id === friendId} onClick={() => setPicked(f.id)}>
            {f.display_name}
          </button>
        ))}
      </div>
      {read.status === "loading" && <p role="status" className="crew__muted">Working out your match…</p>}
      {read.status === "failed" && <p role="alert" className="crew__muted">Couldn&rsquo;t load your match with {friend.display_name} right now.</p>}
      {read.status === "ready" && <CrewMatchView name={friend.display_name} match={read.match} streak={read.streak} />}
    </section>
  );
}
