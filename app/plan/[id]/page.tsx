"use client";

import { useRef, useState } from "react";
import UndoBar from "@/components/UndoBar";
import { useParams } from "next/navigation";
import { dealReasons, spotDistanceKm } from "@/lib/deal-reasons";
import { haptic } from "@/lib/interaction";
import { planView, roundFor, votersFor } from "@/lib/tally";
import { usePlanData } from "@/hooks/use-plan-data";
import { useVoterName } from "@/hooks/use-voter-name";
import { usePlanPresence, usePlanRealtime } from "@/hooks/use-plan-realtime";
import { useHostCommands } from "@/hooks/use-host-commands";
import { useLastMile } from "@/hooks/use-last-mile";
import { useVoteActions } from "@/hooks/use-vote-actions";
import { useLeavePlan } from "@/hooks/use-leave-plan";
import { useRoundFold } from "@/hooks/use-round-fold";
import { usePlanDevice } from "@/hooks/use-plan-device";
import OptionCard from "@/components/OptionCard";
import DecidedPlan from "@/components/DecidedPlan";
import VoteState from "@/components/VoteState";
import ShareActions from "@/components/ShareActions";
import PlanHeader from "@/components/vote/PlanHeader";
import RoundActions from "@/components/vote/RoundActions";
import VoteOptionsGrid from "@/components/vote/VoteOptionsGrid";
import { RoundDots } from "@/components/vote/RoundProgress";
import { useFaceFlight } from "@/components/vote/useFaceFlight";
import { planStateScreen } from "@/components/vote/PlanStates";
import { HostPlanControls, LeaveControl, ReopenControl } from "@/components/vote/PlanControls";
import { participantFailure } from "@/lib/participant-errors";
import { mineFrom } from "@/lib/my-rows";

export default function VotePage() {
  const { id } = useParams<{ id: string }>();

  const {
    load, setLoad, setReloadKey,
    access, accessMessage, setAccess, runAccess,
    plan, setPlan, spots, planSpots, setPlanSpots, votes, setVotes, rsvps, setRsvps, ratings, setRatings, myRows,
    participantHash, refetchVotes, refetchRsvps, refetchRatings, refetchPlanSpots, refetchPlan,
  } = usePlanData(id);
  const { voterName, accountNameTried } = useVoterName();
  // Which rows are this account's: by id once my_plan_rows exists, by name before (F2).
  const mine = mineFrom(myRows, voterName);
  const [notice, setNotice] = useState<string | null>(null);
  // Set once the plan is gone: "self" when this host deleted it here,
  // "remote" when the deletion arrived from somewhere else.
  const [deleted, setDeleted] = useState<"self" | "remote" | null>(null);
  // C6: this member left. Holds which confirm they saw, for the after-copy.
  const [left, setLeft] = useState<"open" | "decided" | null>(null);
  const [activePool, setActivePool] = useState(1);
  // Which way the next round should enter from. Set at the two places that
  // change rounds rather than derived, so going back to round 1 from round 3
  // slides in from the left instead of pretending it is progress.
  const [roundDir, setRoundDir] = useState(1);

  const stageRef = useRef<HTMLDivElement>(null);

  const decided = plan?.status === "decided";
  const winnerId = plan?.winner_spot_id ?? null;
  const stage = plan?.stage ?? (decided ? "decided" : "final");
  const poolCount = plan?.pool_count ?? 1;
  const { nightMode, been } = usePlanDevice(decided, winnerId);

  const host = useHostCommands({ id, plan, setPlan, setPlanSpots, stage, spots, deleted, setDeleted, setNotice });
  const { isHost, deciding, advanceToFinal, decide } = host;
  // The live channels are held so leavePlan can close them BEFORE the page
  // moves on (use-plan-realtime.ts).
  const { dataChannelRef, cancelRefetchesRef } = usePlanRealtime({
    id, access, deleted, left, refetchVotes, refetchRsvps, refetchRatings, refetchPlanSpots, refetchPlan, setPlan, setDeleted,
  });
  const { presentNames, presenceChannelRef } = usePlanPresence({ id, access, voterName, left });
  const { visitSaved, patchPlan, setRsvp, setCarpool, rateWinner } = useLastMile({
    id, plan, setPlan, isHost: host.isHost, runHostCommand: host.runHostCommand, voterName, participantHash, isMine: mine, winnerId,
    rsvps, setRsvps, ratings, setRatings, refetchRsvps, refetchRatings, setNotice, reportParticipantFailure,
  });

  // ── Tallies + this voter's picks (pure helpers in lib/tally.ts) ──
  const round = roundFor(stage, activePool);
  const { poolNumber: currentPoolNumber } = round;
  const { iVotedYes, toggleVote, voteUndo, setVoteUndo } = useVoteActions({
    id, votes, setVotes, voterName, participantHash, mine, decided, round, spots, refetchVotes, setNotice, reportParticipantFailure, onPicked: afterPick,
  });
  const { confirmLeave, setConfirmLeave, leaving, leavePlan } = useLeavePlan({
    id, plan, setLeft, setDeleted, setNotice, presenceChannelRef, dataChannelRef, cancelRefetchesRef,
  });

  // P2: a member other than the host moves through the pool rounds alone.
  // After a pick saves, go to the next round they haven't picked in (after a
  // beat, so the face lands first), unless they already moved elsewhere.
  function afterPick(picked: { phase: string; poolNumber: number }) {
    if (isHost || picked.phase !== "pool") return;
    const chosen = new Set(votes.filter((v) => mine.vote(v) && v.value && v.phase === "pool").map((v) => v.pool_number));
    chosen.add(picked.poolNumber);
    const order = [...Array(poolCount)].map((_, i) => ((picked.poolNumber + i) % poolCount) + 1);
    const next = order.find((pool) => !chosen.has(pool));
    if (!next) return;
    setTimeout(() => {
      setRoundDir(next > picked.poolNumber ? 1 : -1);
      setActivePool((current) => (current === picked.poolNumber ? next : current));
    }, 700);
  }

  // The name is the profile's (F2), so a clash is fixed in Settings, which
  // the notice says; there is no per-plan name to re-enter here.
  function reportParticipantFailure(error: { code?: string; message?: string } | null, fallback: string) {
    setNotice(participantFailure(error, fallback).notice);
  }

  const retryAccess = () => { setAccess("checking"); void runAccess(); };

  const { sawOpenRound, foldDone } = useRoundFold(plan, decided);

  // §25.3 beat 1: a voter's face flies from their seat onto the card they
  // chose. See components/vote/useFaceFlight.ts.
  useFaceFlight();

  const stateScreen = planStateScreen({
    deleted, left, plan, access, accessMessage, load, retryAccess, setLoad, setReloadKey,
  });
  if (stateScreen) return stateScreen;

  // Hold while the account's name resolves, so the page doesn't flash. With no
  // name at all (no profile name, metadata or email), Settings is the fix.
  if (!voterName) {
    return <VoteState kind={accountNameTried ? "needs-name" : "loading"} planTitle={plan?.title} />;
  }

  const {
    voterCount, canEdit, roster, pickedThisRound, othersHere, winnerSpot, visibleSpots,
    hasCurrentSelection, countFor, leaderId, agreement, poolsChosenByMe, allPoolsChosen,
  } = planView({
    votes, rsvps, ratings, presentNames, voterName, spots, planSpots, stage, activePool, poolCount, round, winnerId,
    planOpen: plan!.status === "open", iVotedYes, isMyVote: mine.vote,
  });

  return (
    <main className={"vote-experience mx-auto w-full max-w-4xl px-4 py-6 sm:py-10"}>
      <div
        ref={stageRef}
        className={[
          "vote-shell relative overflow-clip border border-line bg-card p-4 sm:p-7",
          deciding ? "deck-shuffling" : "",
        ].join(" ")}
      >
        <PlanHeader
          plan={plan!}
          voterName={voterName}
          decided={decided}
          stage={stage}
          activePool={activePool}
          poolCount={poolCount}
          nightMode={nightMode}
          roster={roster}
          pickedThisRound={pickedThisRound}
          othersHere={othersHere}
        />

        {stage === "pool" && !decided && (
          <RoundDots
            poolCount={poolCount}
            activePool={activePool}
            chosen={poolsChosenByMe}
            nightMode={nightMode}
            onSelect={(poolNumber) => {
              setRoundDir(poolNumber >= activePool ? 1 : -1);
              setActivePool(poolNumber);
              haptic(6);
            }}
          />
        )}

        {/* Three places in the current round, or the three finalists. On a
            phone this is a snap carousel (see .vote-options-grid); the key
            re-mounts it per round so the next set animates in rather than
            swapping in place.

            Once decided and folded, the grid goes: the winner card beside
            DecidedPlan's reveal showed the same place twice. Its details
            (description, hours, price) move under the reveal. */}
        {!foldDone && (
          <VoteOptionsGrid
            key={`round-${currentPoolNumber}`}
            spots={visibleSpots}
            leaderId={leaderId}
            winnerId={winnerId}
            decided={decided}
            folded={decided && foldDone}
            sawOpenRound={sawOpenRound}
            roundDir={roundDir}
            agreement={agreement}
            renderCard={(spot) => {
              const km = spotDistanceKm(plan!.origin_latitude != null && plan!.origin_longitude != null
                ? { latitude: plan!.origin_latitude, longitude: plan!.origin_longitude } : null, spot);
              return (
                <OptionCard
                  spot={spot}
                  voters={votersFor(votes, spot.id, round)}
                  yesCount={countFor(spot.id)}
                  voted={iVotedYes(spot.id)}
                  isWinner={winnerId === spot.id}
                  isLeader={spot.id === leaderId}
                  decided={decided}
                  distanceKm={km}
                  reasons={dealReasons({ spot, maxBudget: plan!.budget_per_person, radiusKm: plan!.radius_km, distanceKm: km, vibeKeywords: plan!.vibe_preferences, been })}
                  onToggle={() => toggleVote(spot.id)}
                />
              );
            }}
          />
        )}

        {/* Controls / result */}
        {!decided ? (
          <>
          <RoundActions
            isHost={isHost}
            stage={stage}
            activePool={activePool}
            poolCount={poolCount}
            deciding={deciding}
            hasCurrentSelection={hasCurrentSelection}
            allPoolsChosen={allPoolsChosen}
            onContinue={() => {
              setRoundDir(1);
              if (activePool < poolCount) setActivePool((pool) => pool + 1);
              else void advanceToFinal();
            }}
            firstUnchosen={[...Array(poolCount)].map((_, i) => i + 1).find((pool) => !poolsChosenByMe.has(pool)) ?? null}
            onGoToPool={(pool) => { setRoundDir(pool > activePool ? 1 : -1); setActivePool(pool); }}
            onDecide={decide}
          />
          <ShareActions title={plan?.title ?? null} />
          <HostPlanControls host={host} plan={plan} voterCount={voterCount} canEdit={canEdit} />
          </>
        ) : (
          winnerSpot && (
            <DecidedPlan
              plan={plan!}
              winner={winnerSpot}
              voterName={voterName}
              mine={mine}
              isHost={isHost}
              rsvps={rsvps}
              ratings={ratings}
              onSetTime={(iso) => patchPlan({ event_time: iso })}
              roster={roster}
              pickedBy={votersFor(votes, winnerSpot.id, { phase: "final", poolNumber: 0 })}
              onSetRsvp={setRsvp}
              onSetCarpool={setCarpool}
              onClaimBooking={() => patchPlan({ booking_owner: voterName })}
              onMarkBooked={() => patchPlan({ booked: true })}
              onUnmarkBooked={() => patchPlan({ booked: false })}
              onRate={rateWinner}
            />
          )
        )}

        <ReopenControl host={host} plan={plan} decided={decided} ratingCount={ratings.length} />

        <LeaveControl
          isHost={isHost}
          plan={plan}
          decided={decided}
          confirmLeave={confirmLeave}
          setConfirmLeave={setConfirmLeave}
          leaving={leaving}
          leavePlan={leavePlan}
        />

        {voteUndo && !decided && (
          <UndoBar key={voteUndo.message} message={voteUndo.message} onUndo={voteUndo.restore} onDone={() => setVoteUndo(null)} />
        )}

        {/* Sticky so a failure shows where you are: on the decided screen the
            end of the page is far below the RSVP and booking buttons. */}
        {notice && (
          <p role="alert" className="sticky bottom-4 z-10 mt-3 rounded-xl border border-line bg-card px-4 py-3 text-sm font-medium text-punch-text">
            {notice}
          </p>
        )}

        {visitSaved && (
          <p role="status" className="mt-3 text-sm font-medium text-muted">
            {visitSaved === "saved"
              ? "Saved to your Been, with everyone who came."
              : "Rated. We couldn't add it to your Been. Open Been later to add it."}
          </p>
        )}
      </div>

      {!decided && (
        <p className="mt-4 px-1 text-center text-xs text-muted">
          Pick one in each round, then vote on the final three.
        </p>
      )}
    </main>
  );
}
