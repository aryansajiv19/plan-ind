"use client";

import { useCallback, useState } from "react";
import MyRanking from "@/components/ranking/MyRanking";
import type { useRanking } from "@/hooks/use-ranking";
import type { MyRankingRow, ProfileVisit, RankingBucket } from "@/lib/types";

// The demo's Been game: the real MyRanking and RateGame, driven by an
// in-memory list instead of the database. Sample places (real catalogue ids,
// so the links open), nothing saved; a reload starts over.
type Place = Pick<MyRankingRow, "spot_id" | "name" | "area" | "category" | "photo_url">;
const PLACES: Place[] = [
  { spot_id: "50000000-0000-0000-0000-000000000001", name: "Al Qudra Lakes", area: "Seih Al Salam", category: "outdoors", photo_url: "/venues/50000000-0000-0000-0000-000000000001.webp" },
  { spot_id: "83000000-0000-0000-0000-000000000001", name: "DRIFT Beach Dubai", area: "One&Only Royal Mirage", category: "beach_club", photo_url: "/venues/83000000-0000-0000-0000-000000000001.webp" },
  { spot_id: "85000000-0000-0000-0000-000000000002", name: "Padel Art", area: "Al Quoz", category: "padel", photo_url: "/venues/85000000-0000-0000-0000-000000000002.webp" },
  { spot_id: "10000000-0000-0000-0000-000000000003", name: "Ninive", area: "Emirates Towers", category: "brunch", photo_url: "/venues/10000000-0000-0000-0000-000000000003.webp" },
];
// Ranked to start with; Ninive is the one left to rate.
const START: [number, RankingBucket][] = [[0, "loved"], [1, "loved"], [2, "fine"]];
const BAND: Record<RankingBucket, [number, number]> = { loved: [7, 10], fine: [4, 7], meh: [0, 4] };

/** 085's rule: score = lo + (hi - lo) * (n - i) / n, i from 0 at the top. */
function rescore(rows: MyRankingRow[]): MyRankingRow[] {
  return (["loved", "fine", "meh"] as const).flatMap((bucket) => {
    const band = rows.filter((row) => row.bucket === bucket);
    const [lo, hi] = BAND[bucket];
    return band.map((row, i) => ({ ...row, position: i + 1, score: Math.round((lo + ((hi - lo) * (band.length - i)) / band.length) * 10) / 10 }));
  });
}

const row = (place: Place, bucket: RankingBucket): MyRankingRow => ({
  ...place, bucket, position: 0, score: 0, answers: {}, updated_at: "", photo_attribution: null, google_place_id: null,
});

// MyRanking and RateGame read only a visit's spot: who, where, its photo.
const VISITS = PLACES.map(({ spot_id, ...place }) => ({
  spot: { id: spot_id, ...place, photo_attribution: null, google_place_id: null },
})) as unknown as ProfileVisit[];

function useDemoRanking(): ReturnType<typeof useRanking> {
  const [rows, setRows] = useState(() => rescore(START.map(([i, bucket]) => row(PLACES[i], bucket))));
  const bucket = useCallback((which: RankingBucket) =>
    rows.filter((r) => r.bucket === which).map((r) => ({ ...r, spotId: r.spot_id })), [rows]);
  const rank: ReturnType<typeof useRanking>["rank"] = async (spotId, which, { after }) => {
    const place = PLACES.find((p) => p.spot_id === spotId);
    if (!place) return "failed";
    setRows((current) => {
      const rest = current.filter((r) => r.spot_id !== spotId);
      const at = after ? rest.findIndex((r) => r.spot_id === after) + 1 : rest.findIndex((r) => r.bucket === which);
      const next = [...rest];
      next.splice(at < 0 ? next.length : at, 0, row(place, which));
      return rescore(next);
    });
    return "ranked";
  };
  const unrank = async (spotId: string) => { setRows((current) => rescore(current.filter((r) => r.spot_id !== spotId))); return true; };
  return { rows, status: "ready", refresh: async () => {}, bucket, rank, unrank, logVisit: async () => "logged" };
}

export default function DemoRanking() {
  return <MyRanking visits={VISITS} ranking={useDemoRanking()} />;
}
