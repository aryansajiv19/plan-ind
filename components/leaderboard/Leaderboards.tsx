"use client";

import { useMemo, useState } from "react";
import { useLeaderboard } from "@/hooks/use-leaderboard";
import type { ProfileVisit, Spot } from "@/lib/types";

type Scope = "friends" | "dubai" | "area" | "place";
const SCOPES: { key: Scope; label: string }[] = [
  { key: "friends", label: "Friends" },
  { key: "dubai", label: "All Dubai" },
  { key: "area", label: "By area" },
  { key: "place", label: "By place" },
];
const BAND = { loved: "Loved it", fine: "It was fine", meh: "Not for them" } as const;

/**
 * Who's out there most: points for new places, rankings, hosted plans and
 * photos (086). Friends and All Dubai and By area by points; By place is you
 * and your friends who ranked it. Your own row is always pinned.
 */
export default function Leaderboards({ spots, visits }: { spots: Spot[]; visits: ProfileVisit[] }) {
  const [scope, setScope] = useState<Scope>("friends");
  const [period, setPeriod] = useState<"month" | "all">("month");
  const areas = useMemo(() => [...new Set(spots.map((s) => s.area))].sort(), [spots]);
  const places = useMemo(() => [...new Map(visits.filter((v) => v.spot).map((v) => [v.spot!.id, v.spot!])).values()], [visits]);
  const [area, setArea] = useState<string | null>(null);
  const [place, setPlace] = useState<string | null>(null);
  const key = scope === "area" ? (area ?? areas[0] ?? null) : scope === "place" ? (place ?? places[0]?.id ?? null) : null;
  const board = useLeaderboard(scope, key, period);

  return (
    <section className="boards" aria-labelledby="boards-title">
      <div className="boards__head">
        <h2 id="boards-title">Leaderboards</h2>
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
      {scope === "area" && (
        <select className="boards__pick" aria-label="Area" value={key ?? ""} onChange={(e) => setArea(e.target.value)}>
          {areas.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      )}
      {scope === "place" && (places.length ? (
        <select className="boards__pick" aria-label="Place" value={key ?? ""} onChange={(e) => setPlace(e.target.value)}>
          {places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      ) : <p className="demo-empty">Go somewhere and rank it, and you’ll see how your friends rated it here.</p>)}

      {board.status === "failed" && <p className="demo-empty" role="alert">The board didn’t load. Refresh to try again.</p>}
      {board.status === "ready" && (
        board.rows.length === 0 ? (
          <p className="demo-empty">{scope === "place" ? "None of your friends has ranked it yet." : "No points here yet. Go somewhere new and it starts."}</p>
        ) : (
          <ol className="boards__list">
            {board.rows.map((row) => (
              <li key={row.player_key} className="boards__row" data-me={row.is_me ? "" : undefined}>
                <span className="boards__rank" data-top={(row.rank != null && row.rank <= 3) || undefined}>{row.rank ?? "–"}</span>
                <span className="boards__avatar" aria-hidden="true">{row.emoji ?? row.label.slice(0, 1)}</span>
                <span className="boards__name">{row.is_me ? "You" : row.label}</span>
                <span className="boards__points">
                  {row.points != null ? <>{row.points}<small> pts</small></> : row.band ? BAND[row.band] : ""}
                </span>
              </li>
            ))}
          </ol>
        )
      )}
      <p className="boards__note">Shown as first name and initial. Hide yourself from Dubai and area boards in Settings.</p>
    </section>
  );
}
