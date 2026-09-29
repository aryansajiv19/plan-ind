"use client";

import { useState } from "react";
import VenuePhoto from "@/components/VenuePhoto";
import { answerComparison, insertionNeighbours, nextComparison, startInsertion, type InsertionState } from "@/lib/ranking";
import type { useRanking } from "@/hooks/use-ranking";
import type { PlaceRanking, RankingBucket } from "@/lib/types";

type Place = { id: string; name: string; area: string; category: string; photo_url: string | null; photo_attribution: string | null; google_place_id?: string | null };

const BUCKETS: { key: RankingBucket; label: string }[] = [
  { key: "loved", label: "Loved it" },
  { key: "fine", label: "It was fine" },
  { key: "meh", label: "Not for me" },
];
const VIBES = ["buzzing", "chill", "romantic", "family", "fancy"] as const;

/**
 * Rate a place the Beli way: how did it feel (a bucket), then a few "this or
 * that" taps against places you've already ranked in that bucket (binary
 * insertion, lib/ranking.ts: at most ceil(log2(n+1)) taps), then three quick
 * chips. The server places it and scores the whole list 0-10.
 */
export default function RateGame({ place, ranking, onDone }: { place: Place; ranking: ReturnType<typeof useRanking>; onDone?: () => void }) {
  const [bucket, setBucket] = useState<RankingBucket | null>(null);
  const [state, setState] = useState<InsertionState | null>(null);
  const [answers, setAnswers] = useState<PlaceRanking["answers"]>({});
  const [phase, setPhase] = useState<"feel" | "compare" | "chips" | "saving" | "done" | "error">("feel");
  const [message, setMessage] = useState<string | null>(null);

  const list = bucket ? ranking.bucket(bucket).filter((row) => row.spot_id !== place.id) : [];
  const rival = state ? nextComparison(list, state) : null;
  const saved = ranking.rows.find((row) => row.spot_id === place.id);

  function choose(which: RankingBucket) {
    setBucket(which);
    const start = startInsertion(ranking.bucket(which).filter((row) => row.spot_id !== place.id));
    setState(start);
    setPhase("compare");
  }

  function pick(newIsBetter: boolean) {
    if (!state) return;
    const next = answerComparison(state, newIsBetter);
    setState(next);
    if (!nextComparison(list, next)) setPhase("chips");
  }

  async function save() {
    if (!bucket || !state) return;
    setPhase("saving");
    const result = await ranking.rank(place.id, bucket, insertionNeighbours(list, state), answers);
    if (result === "ranked") { setPhase("done"); onDone?.(); return; }
    setMessage(result === "not_visited" ? "Log a visit here first, then rank it." : "That didn't save. Try again.");
    setPhase("error");
  }

  return (
    <section className="rate-game" aria-label={`Rate ${place.name}`}>
      <div className="rate-game__place">
        <span className="rate-game__photo"><VenuePhoto spot={{ ...place, category: place.category }} sizes="8rem" /></span>
        <div>
          <p className="rate-game__kicker">Rate your night</p>
          <h3>{place.name}</h3>
          <p className="rate-game__area">{place.area}</p>
        </div>
      </div>

      {phase === "feel" && (
        <div className="rate-game__step" key="feel">
          <p className="rate-game__ask">How was it?</p>
          <div className="rate-game__buckets">
            {BUCKETS.map((option) => (
              <button key={option.key} type="button" className="rate-game__bucket" data-bucket={option.key} onClick={() => choose(option.key)}>
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {phase === "compare" && rival && (
        <div className="rate-game__step" key={rival.spot_id}>
          <p className="rate-game__ask">Which did you like more?</p>
          <div className="rate-game__versus">
            <button type="button" className="rate-game__card" onClick={() => pick(true)}>
              <span className="rate-game__card-photo"><VenuePhoto spot={{ ...place }} sizes="14rem" /></span>
              <strong>{place.name}</strong>
            </button>
            <span className="rate-game__or" aria-hidden="true">or</span>
            <button type="button" className="rate-game__card" onClick={() => pick(false)}>
              <span className="rate-game__card-photo">
                <VenuePhoto spot={{ id: rival.spot_id, photo_url: rival.photo_url, photo_attribution: rival.photo_attribution, google_place_id: rival.google_place_id, category: rival.category }} sizes="14rem" />
              </span>
              <strong>{rival.name}</strong>
            </button>
          </div>
        </div>
      )}

      {(phase === "chips" || (phase === "compare" && !rival)) && (
        <div className="rate-game__step" key="chips">
          <p className="rate-game__ask">Quickly: what was it like?</p>
          <div className="rate-game__chips" role="group" aria-label="Vibe">
            {VIBES.map((vibe) => (
              <button key={vibe} type="button" aria-pressed={answers.vibe === vibe} onClick={() => setAnswers((a) => ({ ...a, vibe: a.vibe === vibe ? undefined : vibe }))}>{vibe}</button>
            ))}
          </div>
          <div className="rate-game__chips" role="group" aria-label="Value">
            {(["great", "fair", "pricey"] as const).map((value) => (
              <button key={value} type="button" aria-pressed={answers.value === value} onClick={() => setAnswers((a) => ({ ...a, value: a.value === value ? undefined : value }))}>
                {value === "great" ? "Great value" : value === "fair" ? "Fair price" : "Pricey"}
              </button>
            ))}
          </div>
          <div className="rate-game__chips" role="group" aria-label="Would you go back?">
            {[true, false].map((again) => (
              <button key={String(again)} type="button" aria-pressed={answers.again === again} onClick={() => setAnswers((a) => ({ ...a, again: a.again === again ? undefined : again }))}>
                {again ? "I'd go back" : "Once was enough"}
              </button>
            ))}
          </div>
          <button type="button" className="rate-game__save" onClick={() => void save()}>Rank it</button>
        </div>
      )}

      {phase === "saving" && <p className="rate-game__ask" role="status">Placing it…</p>}

      {phase === "done" && saved && (
        <div className="rate-game__step rate-game__result" key="done" role="status">
          <p className="rate-game__score">{Number(saved.score).toFixed(1)}<span>/10</span></p>
          <p>#{saved.position} of your {saved.bucket === "loved" ? "loved" : saved.bucket === "fine" ? "fine" : "not-for-me"} places</p>
        </div>
      )}

      {phase === "error" && (
        <p className="rate-game__ask" role="alert">{message} <button type="button" onClick={() => setPhase("feel")}>Start again</button></p>
      )}
    </section>
  );
}
