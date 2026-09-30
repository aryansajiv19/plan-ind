"use client";

import { useState } from "react";
import Fold from "@/components/Fold";
import { CrewMatchView } from "@/components/crew/CrewMatch";
import { FRIEND_ROWS } from "@/components/demo/demoFixtures";
import type { CrewMatch, CrewStreak } from "@/lib/types";

// The real Crew match card on sample numbers, labelled, one per demo friend.
// One of them is still locked, so the unlock state is visible too.
const SAMPLE: Record<string, { match: CrewMatch; streak: CrewStreak }> = {
  sara: {
    match: { status: "ready", score: 87, parts: { plans: { agreement: 83, rounds: 12 }, rankings: { agreement: 90 }, categories: { overlap: 86, shared: 6 } }, biggest_split: "night", signals: 18 },
    streak: { months: 5, since: "2026-05", this_month_open: false },
  },
  zain: {
    match: { status: "ready", score: 74, parts: { plans: { agreement: 71, rounds: 7 }, rankings: null, categories: { overlap: 80, shared: 4 } }, biggest_split: "food", signals: 11 },
    streak: { months: 2, since: "2026-08", this_month_open: true },
  },
  maya: {
    match: { status: "not_enough", signals: 2, needed: 3 },
    streak: { months: 0, since: null, this_month_open: true },
  },
  omar: {
    match: { status: "ready", score: 91, parts: { plans: { agreement: 92, rounds: 9 }, rankings: { agreement: 88 }, categories: null }, biggest_split: null, signals: 9 },
    streak: { months: 3, since: "2026-07", this_month_open: false },
  },
  leila: {
    match: { status: "ready", score: 68, parts: { plans: { agreement: 60, rounds: 5 }, rankings: null, categories: { overlap: 75, shared: 3 } }, biggest_split: "active", signals: 8 },
    streak: { months: 1, since: "2026-09", this_month_open: false },
  },
};

export default function DemoCrewMatch() {
  const [picked, setPicked] = useState<string>(FRIEND_ROWS[0].id);
  const friend = FRIEND_ROWS.find((f) => f.id === picked)!;
  const sample = SAMPLE[picked];
  return (
    <section className="crew" aria-labelledby="crew-title">
      <Fold heading={<h2 id="crew-title">Crew match</h2>} hint="How your taste lines up with each friend">
      <div className="crew__friends" role="group" aria-label="Friend">
        {FRIEND_ROWS.map((f) => (
          <button key={f.id} type="button" aria-pressed={f.id === picked} onClick={() => setPicked(f.id)}>{f.name}</button>
        ))}
      </div>
      <CrewMatchView name={friend.name} match={sample.match} streak={sample.streak} />
      </Fold>
    </section>
  );
}
