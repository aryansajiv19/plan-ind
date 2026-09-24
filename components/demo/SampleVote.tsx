"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import OptionCard from "@/components/OptionCard";
import VoteSeats from "@/components/vote/VoteSeats";
import VoteOptionsGrid from "@/components/vote/VoteOptionsGrid";
import { RoundDots, RoundLabel } from "@/components/vote/RoundProgress";
import { useFaceFlight } from "@/components/vote/useFaceFlight";
import SampleDecided from "@/components/demo/SampleDecided";
import { haptic } from "@/lib/interaction";
import { coordinatesForArea } from "@/lib/dubai-areas";
import { dealReasons, spotDistanceKm } from "@/lib/deal-reasons";
import { agreementOf, leaderOf, roundFor, votersFor, yesCount, type Round } from "@/lib/tally";
import type { Spot, Vote } from "@/lib/types";
import {
  ARRIVAL_DELAYS_MS,
  EARLY_FRIEND,
  FRIEND_PICKS,
  SAMPLE_FRIENDS,
  SAMPLE_PLAN,
  SAMPLE_POOLS,
  SAMPLE_VOTER,
} from "@/components/demo/sampleDecision";

// /demo/vote: the real vote screen's pieces (OptionCard, seats, round dots,
// the options grid, the face flight, WinnerReveal) driven by fixtures and
// React state instead of Supabase. Nothing is fetched and nothing persists.
// The friends' votes are scheduled a beat after yours so counts and faces
// arrive the way Realtime delivers them on a live plan.

type Stage = "pool" | "final" | "decided";
type RoundKey = keyof typeof FRIEND_PICKS;

const ALL_SPOTS = SAMPLE_POOLS.flat();
const spotById = (id: string) => ALL_SPOTS.find((spot) => spot.id === id)!;
const keyOf = (round: Round): RoundKey => (round.phase === "final" ? "final" : (`pool${round.poolNumber}` as RoundKey));
const roundOf = (key: RoundKey): Round => (key === "final" ? { phase: "final", poolNumber: 0 } : { phase: "pool", poolNumber: Number(key.slice(4)) });
const ORIGIN = coordinatesForArea(SAMPLE_PLAN.originLabel);

function voteFor(voter: string, spotId: string, round: Round): Vote {
  return { id: `sample-${round.phase}-${round.poolNumber}-${voter}`, plan_id: "sample", spot_id: spotId, voter_name: voter, value: true, phase: round.phase, pool_number: round.poolNumber };
}

/** Adds one friend's pinned pick for a round, unless they already voted in it. */
function withFriend(votes: Vote[], key: RoundKey, friend: number, spotIds: readonly string[]): Vote[] {
  const round = roundOf(key);
  const name = SAMPLE_FRIENDS[friend];
  if (votes.some((v) => v.voter_name === name && v.phase === round.phase && v.pool_number === round.poolNumber)) return votes;
  return [...votes, voteFor(name, spotIds[FRIEND_PICKS[key][friend]], round)];
}

/** Most picks wins; a tie goes to the earlier card in the deal. */
function topOf(votes: Vote[], spotIds: readonly string[], round: Round): string {
  return spotIds.reduce((best, id) => (yesCount(votes, id, round) > yesCount(votes, best, round) ? id : best), spotIds[0]);
}

const poolIds = (pool: number) => SAMPLE_POOLS[pool - 1].map((spot) => spot.id);

function SampleRun({ onReplay }: { onReplay: () => void }) {
  const [stage, setStage] = useState<Stage>("pool");
  const [activePool, setActivePool] = useState(1);
  const [roundDir, setRoundDir] = useState(1);
  const [finalists, setFinalists] = useState<string[]>([]);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [foldDone, setFoldDone] = useState(false);
  const [votes, setVotes] = useState<Vote[]>(() => withFriend([], "pool1", EARLY_FRIEND.pool1, poolIds(1)));
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const scheduled = useRef(new Set<RoundKey>());
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  const decided = stage === "decided";
  const round = roundFor(stage === "pool" ? "pool" : "final", activePool);
  const roundKey = keyOf(round);
  const visibleIds = stage === "pool" ? poolIds(activePool) : finalists;

  // A new round or the result enters at the top of the screen. Scrolled only
  // after React has committed the new view (see app/CLAUDE.md), and only when
  // the top of the plan is off screen, so a phone never jumps for nothing.
  useEffect(() => {
    const top = shellRef.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) shellRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
  }, [roundKey, decided]);

  function later(run: () => void, ms: number) {
    const timer = setTimeout(() => { timers.current.delete(timer); run(); }, ms);
    timers.current.add(timer);
  }

  function enterPool(pool: number) {
    const key = `pool${pool}` as RoundKey;
    setVotes((current) => withFriend(current, key, EARLY_FRIEND[key], poolIds(pool)));
    setRoundDir(pool >= activePool ? 1 : -1);
    setActivePool(pool);
  }

  /** Everyone who has not voted in these rounds votes now; pending arrivals are cancelled. */
  function everyoneIn(current: Vote[], keys: readonly RoundKey[], ids: (key: RoundKey) => readonly string[]): Vote[] {
    timers.current.forEach((timer) => clearTimeout(timer));
    timers.current.clear();
    return keys.reduce((acc, key) => SAMPLE_FRIENDS.reduce((inner, _, friend) => withFriend(inner, key, friend, ids(key)), acc), current);
  }

  function pick(spotId: string) {
    if (decided) return;
    const mine = votes.find((v) => v.voter_name === SAMPLE_VOTER && v.phase === round.phase && v.pool_number === round.poolNumber);
    const clearing = mine?.spot_id === spotId;
    haptic(clearing ? 6 : 10);
    setVotes((current) => {
      const rest = current.filter((v) => !(v.voter_name === SAMPLE_VOTER && v.phase === round.phase && v.pool_number === round.poolNumber));
      return clearing ? rest : [...rest, voteFor(SAMPLE_VOTER, spotId, round)];
    });
    if (clearing || scheduled.current.has(roundKey)) return;
    scheduled.current.add(roundKey);
    const key = roundKey;
    const ids = [...visibleIds];
    SAMPLE_FRIENDS.map((_, friend) => friend)
      .filter((friend) => friend !== EARLY_FRIEND[key])
      .forEach((friend, order) => later(() => setVotes((current) => withFriend(current, key, friend, ids)), ARRIVAL_DELAYS_MS[order]));
  }

  function buildShortlist() {
    const keys: RoundKey[] = ["pool1", "pool2", "pool3"];
    const all = everyoneIn(votes, keys, (key) => poolIds(roundOf(key).poolNumber));
    const chosen = keys.map((key) => topOf(all, poolIds(roundOf(key).poolNumber), roundOf(key)));
    setVotes(withFriend(all, "final", EARLY_FRIEND.final, chosen));
    setFinalists(chosen);
    setRoundDir(1);
    setStage("final");
    haptic(10);
  }

  function decide() {
    const all = everyoneIn(votes, ["final"], () => finalists);
    setVotes(all);
    setWinnerId(topOf(all, finalists, roundOf("final")));
    setStage("decided");
    haptic(12);
    // The timer owns the destination (winner alone), the CSS fold only the
    // journey: same split as the live page, so reduced motion still lands.
    later(() => setFoldDone(true), 360);
  }

  useFaceFlight();

  const visibleSpots: Spot[] = visibleIds.map(spotById);
  const countFor = (spotId: string) => yesCount(votes, spotId, round);
  const myPick = votes.find((v) => v.voter_name === SAMPLE_VOTER && v.phase === round.phase && v.pool_number === round.poolNumber)?.spot_id ?? null;
  const leaderId = leaderOf(visibleIds, countFor);
  const agreement = agreementOf(visibleIds.map(countFor));
  const roster = [SAMPLE_VOTER, ...SAMPLE_FRIENDS];
  const pickedThisRound = new Set(votes.filter((v) => v.phase === round.phase && v.pool_number === round.poolNumber).map((v) => v.voter_name));
  const waitingOn = SAMPLE_FRIENDS.filter((name) => !pickedThisRound.has(name)).map((name) => name.split(" ")[0]);
  const poolsChosen = new Set(votes.filter((v) => v.voter_name === SAMPLE_VOTER && v.phase === "pool").map((v) => v.pool_number));
  const allPoolsChosen = [1, 2, 3].every((pool) => poolsChosen.has(pool));
  const winner = winnerId ? spotById(winnerId) : null;

  return (
    <div
      ref={shellRef}
      className="vote-shell relative overflow-hidden border border-line bg-card p-4 sm:p-7"
    >
      <div className="vote-header flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">{SAMPLE_PLAN.title}</h1>
          <p className="mt-1 text-sm text-muted">You and four friends, deciding dinner.</p>
          <p className="vote-plan-constraints">
            Up to AED {SAMPLE_PLAN.budgetPerPerson} per person · within {SAMPLE_PLAN.radiusKm} km of {SAMPLE_PLAN.originLabel}
          </p>
          {!decided && (
            <RoundLabel stage={stage === "pool" ? "pool" : "final"} activePool={activePool} poolCount={SAMPLE_PLAN.poolCount} nightMode={false} />
          )}
          {!decided && (
            <VoteSeats roster={roster} voterName={SAMPLE_VOTER} picked={pickedThisRound} othersHere={[...SAMPLE_FRIENDS]} />
          )}
        </div>
        <span className="vote-deadline shrink-0 whitespace-nowrap px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-grape">
          {decided ? "Decided" : "Sample plan"}
        </span>
      </div>

      {stage === "pool" && (
        <RoundDots
          poolCount={SAMPLE_PLAN.poolCount}
          activePool={activePool}
          chosen={poolsChosen}
          nightMode={false}
          onSelect={(pool) => { enterPool(pool); haptic(6); }}
        />
      )}

      {!foldDone && (
        <VoteOptionsGrid
          key={`round-${round.phase}-${round.poolNumber}`}
          spots={visibleSpots}
          leaderId={leaderId}
          winnerId={winnerId}
          decided={decided}
          folded={false}
          sawOpenRound
          roundDir={roundDir}
          agreement={agreement}
          renderCard={(spot) => {
            const km = spotDistanceKm(ORIGIN, spot);
            return (
              <OptionCard
                spot={spot}
                voters={votersFor(votes, spot.id, round)}
                yesCount={countFor(spot.id)}
                voted={myPick === spot.id}
                isWinner={winnerId === spot.id}
                isLeader={spot.id === leaderId}
                decided={decided}
                distanceKm={km}
                reasons={dealReasons({ spot, maxBudget: SAMPLE_PLAN.budgetPerPerson, radiusKm: SAMPLE_PLAN.radiusKm, distanceKm: km })}
                onToggle={() => pick(spot.id)}
              />
            );
          }}
        />
      )}

      {!decided ? (
        <>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            {stage === "pool" ? (
              <button
                type="button"
                onClick={() => (activePool < SAMPLE_PLAN.poolCount ? enterPool(activePool + 1) : buildShortlist())}
                disabled={!myPick || (activePool === SAMPLE_PLAN.poolCount && !allPoolsChosen)}
                className="vote-primary-action flex-1 rounded-2xl border-2 border-ink font-display text-lg font-extrabold disabled:opacity-40"
              >
                {activePool < SAMPLE_PLAN.poolCount ? `Continue to round ${activePool + 1}` : "Build the final shortlist"}
              </button>
            ) : (
              <button
                type="button"
                onClick={decide}
                disabled={!myPick}
                className="vote-primary-action flex-1 rounded-2xl border-2 border-ink font-display text-lg font-extrabold disabled:opacity-40"
              >
                Choose the final place
              </button>
            )}
          </div>
          <p className="vote-action-hint" aria-live="polite">
            {!myPick
              ? "Choose one place to continue. You can change your choice before moving on."
              : waitingOn.length > 0
                ? `Your vote is in. Waiting on ${waitingOn.join(", ")}.`
                : stage === "final"
                  ? "Everyone has voted. Choose the place the group should visit."
                  : activePool < SAMPLE_PLAN.poolCount
                    ? `Round ${activePool} is set. Continue when you’re ready.`
                    : allPoolsChosen
                      ? "All rounds are set. Build the final shortlist from each round’s top pick."
                      : "Pick a place in every round before building the shortlist."}
          </p>
        </>
      ) : (
        winner && <SampleDecided winner={winner} votes={votes} finalists={finalists} onReplay={onReplay} />
      )}
    </div>
  );
}

/** Replay remounts the run, which clears its state and its pending timers. */
export default function SampleVote() {
  const [run, setRun] = useState(0);
  return (
    <>
      <SampleRun key={run} onReplay={() => setRun((n) => n + 1)} />
      <p className="mt-2 text-center text-sm text-muted">
        <Link href="/demo" className="inline-flex min-h-11 items-center px-3 underline underline-offset-2">Back to the demo</Link>
      </p>
    </>
  );
}
