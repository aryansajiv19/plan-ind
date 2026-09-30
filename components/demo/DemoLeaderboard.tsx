"use client";

import { useState } from "react";
import Fold from "@/components/Fold";

// The demo's Friends leaderboard, in the real Leaderboards' markup (.boards)
// so it takes the same styling. Sample people, labelled as such; the points
// follow 086 (new place 10, first time in an area 20, ranking 5, hosting 15).
type Scope = "friends" | "dubai" | "area" | "place";
type Row = { name: string; points?: number; band?: string; me?: boolean };
const SCOPES: { key: Scope; label: string }[] = [
  { key: "friends", label: "Friends" },
  { key: "dubai", label: "All Dubai" },
  { key: "area", label: "By area" },
  { key: "place", label: "By place" },
];
const BOARDS: Record<Exclude<Scope, "place">, Record<"month" | "all", Row[]>> = {
  friends: {
    month: [{ name: "Sara A.", points: 95 }, { name: "You", points: 70, me: true }, { name: "Omar A.", points: 45 }, { name: "Zain M.", points: 15 }],
    all: [{ name: "Sara A.", points: 410 }, { name: "Omar A.", points: 365 }, { name: "You", points: 330, me: true }, { name: "Zain M.", points: 240 }, { name: "Leila N.", points: 185 }],
  },
  dubai: {
    month: [{ name: "Noor H.", points: 160 }, { name: "Karan P.", points: 135 }, { name: "Sara A.", points: 95 }, { name: "Ali R.", points: 90 }, { name: "You", points: 70, me: true }],
    all: [{ name: "Noor H.", points: 720 }, { name: "Karan P.", points: 655 }, { name: "Sara A.", points: 410 }, { name: "Omar A.", points: 365 }, { name: "You", points: 330, me: true }],
  },
  area: {
    month: [{ name: "Omar A.", points: 25 }, { name: "You", points: 15, me: true }, { name: "Ali R.", points: 10 }],
    all: [{ name: "Omar A.", points: 85 }, { name: "Ali R.", points: 60 }, { name: "You", points: 45, me: true }],
  },
};
// The closed board says where you stand, so the list is one tap away.
const MY_RANK = BOARDS.friends.month.findIndex((row) => row.me) + 1;
const MY_LINE = `You’re ${MY_RANK === 1 ? "1st" : MY_RANK === 2 ? "2nd" : MY_RANK === 3 ? "3rd" : `${MY_RANK}th`} of ${BOARDS.friends.month.length} friends this month`;
// By place is you and your friends who ranked it, best first.
const PLACE: Row[] = [{ name: "Sara A.", band: "Loved it" }, { name: "You", band: "Loved it", me: true }, { name: "Zain M.", band: "It was fine" }];

export default function DemoLeaderboard() {
  const [scope, setScope] = useState<Scope>("friends");
  const [period, setPeriod] = useState<"month" | "all">("month");
  const rows = scope === "place" ? PLACE : BOARDS[scope][period];

  return (
    <section className="boards" aria-labelledby="demo-boards-title">
      <Fold heading={<h2 id="demo-boards-title">Leaderboards</h2>} hint={MY_LINE}>
      <div className="boards__head">
        {scope !== "place" && (
          <div className="boards__period" role="group" aria-label="Period">
            <button type="button" aria-pressed={period === "month"} onClick={() => setPeriod("month")}>This month</button>
            <button type="button" aria-pressed={period === "all"} onClick={() => setPeriod("all")}>All time</button>
          </div>
        )}
      </div>
      <div className="boards__scopes" role="tablist" aria-label="Board">
        {SCOPES.map((option) => (
          <button key={option.key} type="button" role="tab" aria-selected={scope === option.key} onClick={() => setScope(option.key)}>{option.label}</button>
        ))}
      </div>
      {scope === "area" && <p className="boards__pick">Al Quoz</p>}
      {scope === "place" && <p className="boards__pick">Ninive</p>}
      <ol className="boards__list">
        {rows.map((row, i) => (
          <li key={row.name} className="boards__row" data-me={row.me ? "" : undefined}>
            <span className="boards__rank" data-top={i < 3 || undefined}>{i + 1}</span>
            <span className="boards__avatar" aria-hidden="true">{row.name.slice(0, 1)}</span>
            <span className="boards__name">{row.name}</span>
            <span className="boards__points">{row.points != null ? <>{row.points}<small> pts</small></> : row.band}</span>
          </li>
        ))}
      </ol>
      <p className="boards__note">Sample people, not real members. On your own account it’s your friends and Dubai, shown as first name and initial.</p>
      </Fold>
    </section>
  );
}
