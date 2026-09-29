"use client";

import { usePlaceScores } from "@/hooks/use-place-scores";

// The community score on a place page, once five or more people ranked it;
// nothing otherwise (never a 0).
export default function PlaceScoreChip({ spotId }: { spotId: string }) {
  const scores = usePlaceScores([spotId]);
  const score = scores.status === "ready" ? scores.scores.get(spotId) : undefined;
  if (!score) return null;
  return <span className="place-score-chip">★ {score.score.toFixed(1)} <small>from {score.raters} people</small></span>;
}
