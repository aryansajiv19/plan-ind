"use client";

import Link from "next/link";
import { useState } from "react";
import RateGame from "@/components/ranking/RateGame";
import type { useRanking } from "@/hooks/use-ranking";
import type { ProfileVisit, RankingBucket } from "@/lib/types";

const BANDS: { key: RankingBucket; label: string }[] = [
  { key: "loved", label: "Loved" },
  { key: "fine", label: "Fine" },
  { key: "meh", label: "Not for me" },
];

/**
 * Been's game: places you've been but not ranked yet (tap one to play), then
 * your ranked list with its 0-10 scores. A failed read says so; it is never
 * shown as "nothing ranked".
 */
export default function MyRanking({ visits, ranking }: { visits: ProfileVisit[]; ranking: ReturnType<typeof useRanking> }) {
  const [playing, setPlaying] = useState<string | null>(null);
  const ranked = new Set(ranking.rows.map((row) => row.spot_id));
  const pending = [...new Map(visits.filter((v) => v.spot && !ranked.has(v.spot.id)).map((v) => [v.spot!.id, v.spot!])).values()];
  const current = pending.find((spot) => spot.id === playing);

  if (ranking.status === "failed") return <p className="demo-empty" role="alert">Your ranking didn’t load. Refresh to try again.</p>;
  if (ranking.status !== "ready") return null;

  return (
    <div className="my-ranking">
      {pending.length > 0 && (
        <section aria-labelledby="rate-pending-title" className="my-ranking__pending">
          <h2 id="rate-pending-title">Rate your places <span>{pending.length}</span></h2>
          {current ? (
            <RateGame place={current} ranking={ranking} onDone={() => setTimeout(() => setPlaying(null), 1800)} />
          ) : (
            <ul>
              {pending.map((spot) => (
                <li key={spot.id}>
                  <button type="button" onClick={() => setPlaying(spot.id)}>
                    <strong>{spot.name}</strong>
                    <span>{spot.area} · tap to rate</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {ranking.rows.length > 0 && (
        <section aria-labelledby="my-ranking-title" className="my-ranking__list">
          <h2 id="my-ranking-title">My ranking</h2>
          {BANDS.map((band) => {
            const rows = ranking.rows.filter((row) => row.bucket === band.key);
            if (!rows.length) return null;
            return (
              <div key={band.key} className="my-ranking__band" data-bucket={band.key}>
                <h3>{band.label}</h3>
                <ol>
                  {rows.map((row) => (
                    <li key={row.spot_id}>
                      <span className="my-ranking__score">{Number(row.score).toFixed(1)}</span>
                      <Link href={`/place/${row.spot_id}`}>{row.name}</Link>
                      <span className="my-ranking__area">{row.area}</span>
                      <button type="button" onClick={() => void ranking.unrank(row.spot_id)} aria-label={`Remove ${row.name} from your ranking`}>×</button>
                    </li>
                  ))}
                </ol>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
