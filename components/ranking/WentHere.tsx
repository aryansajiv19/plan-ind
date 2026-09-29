"use client";

import { useState } from "react";
import RateGame from "@/components/ranking/RateGame";
import { useRanking } from "@/hooks/use-ranking";

type Place = { id: string; name: string; area: string; category: string; photo_url: string | null; photo_attribution: string | null; google_place_id?: string | null };

// "I went here" on a place page: logs a visit (five a day, 085's log_visit),
// then straight into the rating game. A refusal says why.
export default function WentHere({ place }: { place: Place }) {
  const ranking = useRanking(true);
  const [state, setState] = useState<"idle" | "busy" | "rate" | "done" | { error: string }>("idle");
  const already = ranking.rows.find((row) => row.spot_id === place.id);

  async function go() {
    setState("busy");
    const result = await ranking.logVisit(place.id);
    if (result === "logged") { await ranking.refresh(); setState("rate"); return; }
    setState({ error: result === "limited" ? "That's five places logged today. Try again tomorrow." : result === "not_found" ? "This place can't be logged." : "That didn't save. Try again." });
  }

  if (already && state === "idle") {
    return <p className="went-here__ranked">You ranked it <strong>{Number(already.score).toFixed(1)}</strong>/10</p>;
  }
  if (state === "rate" || state === "done") {
    return <RateGame place={place} ranking={ranking} onDone={() => setState("done")} />;
  }
  return (
    <div className="went-here">
      <button type="button" className="went-here__button" onClick={() => void go()} disabled={state === "busy"}>
        {state === "busy" ? "Logging…" : "I went here"}
      </button>
      {typeof state === "object" && <p role="alert">{state.error}</p>}
    </div>
  );
}
