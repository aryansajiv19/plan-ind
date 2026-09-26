"use client";

import { useEffect, useRef, useState } from "react";
import OptionCard from "@/components/OptionCard";
import { coordinatesForArea } from "@/lib/dubai-areas";
import { dealReasons, spotDistanceKm } from "@/lib/deal-reasons";
import { leaderOf, votersFor, yesCount, type Round } from "@/lib/tally";
import type { Vote } from "@/lib/types";
import { FRIEND_PICKS, SAMPLE_FRIENDS, SAMPLE_PLAN, SAMPLE_POOLS, SAMPLE_VOTER } from "@/components/demo/sampleDecision";

// The landing hero: round one of the /demo/vote sample group, replayed on a
// loop with the real OptionCard. Faces arrive in the order the demo's friends
// vote, "You" tips it, the leader wins, then it resets. Fixture-driven: no
// fetch, nothing saved, labelled as a sample group like /demo/vote.

const ROUND: Round = { phase: "pool", poolNumber: 1 };
const CARDS = SAMPLE_POOLS[0];
const ORIGIN = coordinatesForArea(SAMPLE_PLAN.originLabel);

const vote = (voter: string, index: number): Vote => ({
  id: `loop-${voter}`, plan_id: "sample", spot_id: CARDS[index].id, voter_name: voter, value: true, phase: "pool", pool_number: 1,
});
// Friends 1 and 2 first, then you, then the rest: the leader visibly pulls ahead.
const [maya, omar, priya, sam] = SAMPLE_FRIENDS.map((name, i) => vote(name, FRIEND_PICKS.pool1[i]));
const STEPS: readonly Vote[] = [maya, omar, vote(SAMPLE_VOTER, FRIEND_PICKS.pool1[0]), priya, sam];
const BEAT_MS = 850;
const HOLD_MS = 3200;

export default function LiveVoteLoop() {
  const ref = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [running, setRunning] = useState(false);
  const [reduced, setReduced] = useState(false);

  // Runs only while on screen, and never under reduced motion, which shows
  // the settled result instead of the replay.
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener("change", sync);
    const el = ref.current;
    const observer = el ? new IntersectionObserver(([entry]) => setRunning(entry.isIntersecting)) : null;
    if (el) observer!.observe(el);
    return () => { media.removeEventListener("change", sync); observer?.disconnect(); };
  }, []);

  useEffect(() => {
    if (!running || reduced) return;
    const done = step > STEPS.length;
    const timer = setTimeout(() => setStep(done ? 0 : step + 1), done ? HOLD_MS : BEAT_MS);
    return () => clearTimeout(timer);
  }, [running, reduced, step]);

  const shown = reduced ? STEPS.length + 1 : step;
  const votes = STEPS.slice(0, shown);
  const decided = shown > STEPS.length;
  const countFor = (id: string) => yesCount(votes, id, ROUND);
  const leaderId = leaderOf(CARDS.map((spot) => spot.id), countFor);

  return (
    <div ref={ref} className="live-vote vote-experience vote-experience--embed">
      <p className="live-vote__label">
        <span>{SAMPLE_PLAN.title}</span>
        <span className="live-vote__meta">{decided ? "Decided" : "Round 1 of 3"} · a sample group of five</span>
      </p>
      {/* inert: the cards are real buttons, but here they are an illustration. */}
      <div className="live-vote__cards" inert>
        {CARDS.map((spot) => {
          const km = spotDistanceKm(ORIGIN, spot);
          return (
            <OptionCard
              key={spot.id}
              spot={spot}
              voters={votersFor(votes, spot.id, ROUND)}
              yesCount={countFor(spot.id)}
              voted={votes.some((v) => v.voter_name === SAMPLE_VOTER && v.spot_id === spot.id)}
              isWinner={decided && spot.id === leaderId}
              isLeader={spot.id === leaderId}
              decided={decided}
              distanceKm={km}
              reasons={dealReasons({ spot, maxBudget: SAMPLE_PLAN.budgetPerPerson, radiusKm: SAMPLE_PLAN.radiusKm, distanceKm: km })}
              onToggle={() => {}}
            />
          );
        })}
      </div>
    </div>
  );
}
