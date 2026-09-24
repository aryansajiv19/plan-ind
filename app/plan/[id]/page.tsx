"use client";

import { useEffect, useRef, useState } from "react";
import UndoBar from "@/components/UndoBar";
import { useParams } from "next/navigation";
import { addBeen, getBeen } from "@/lib/device";
import { dealReasons, spotDistanceKm } from "@/lib/deal-reasons";
import { haptic } from "@/lib/interaction";
import { agreementOf, isInRound, leaderOf, roundFor, visibleSpotsFor, votersFor, yesCount } from "@/lib/tally";
import { usePlanData } from "@/hooks/use-plan-data";
import { useVoterName } from "@/hooks/use-voter-name";
import { usePlanPresence, usePlanRealtime } from "@/hooks/use-plan-realtime";
import { useHostCommands } from "@/hooks/use-host-commands";
import { useLastMile } from "@/hooks/use-last-mile";
import { useVoteActions } from "@/hooks/use-vote-actions";
import { useLeavePlan } from "@/hooks/use-leave-plan";
import OptionCard from "@/components/OptionCard";
import NameGate from "@/components/NameGate";
import DecidedPlan from "@/components/DecidedPlan";
import VoteState from "@/components/VoteState";
import ShareActions from "@/components/ShareActions";
import VoteSeats from "@/components/vote/VoteSeats";
import VoteOptionsGrid from "@/components/vote/VoteOptionsGrid";
import { RoundDots, RoundLabel } from "@/components/vote/RoundProgress";
import { useFaceFlight } from "@/components/vote/useFaceFlight";
import { planStateScreen } from "@/components/vote/PlanStates";
import { HostPlanControls, LeaveControl, ReopenControl } from "@/components/vote/PlanControls";
import { participantFailure } from "@/lib/participant-errors";

function closesLabel(deadline: string | null): string {
  if (!deadline) return "Open";
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return "Voting closed";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h >= 1 ? `Closes in ${h}h` : `Closes in ${m}m`;
}

export default function VotePage() {
  const { id } = useParams<{ id: string }>();

  const {
    load, setLoad, setReloadKey,
    access, setAccess, runAccess, captchaStatus, setCaptchaStatus, onCaptchaVerify,
    plan, setPlan, spots, planSpots, setPlanSpots, votes, setVotes, rsvps, setRsvps, ratings, setRatings,
    participantHash, refetchVotes, refetchRsvps, refetchRatings, refetchPlanSpots,
  } = usePlanData(id);
  const { voterName, setVoterName, accountNameTried } = useVoterName(id);
  const [notice, setNotice] = useState<string | null>(null);
  // Set once the plan is gone: "self" when this host deleted it here,
  // "remote" when the deletion arrived from somewhere else.
  const [deleted, setDeleted] = useState<"self" | "remote" | null>(null);
  // C6: this member left. Holds which confirm they saw, for the after-copy.
  const [left, setLeft] = useState<"open" | "decided" | null>(null);
  const [nightMode, setNightMode] = useState(false);
  const [activePool, setActivePool] = useState(1);
  // Which way the next round should enter from. Set at the two places that
  // change rounds rather than derived, so going back to round 1 from round 3
  // slides in from the left instead of pretending it is progress.
  const [roundDir, setRoundDir] = useState(1);
  const [been] = useState(getBeen); // past winners on this device, for "New to you"

  const stageRef = useRef<HTMLDivElement>(null);
  const revealFired = useRef(false);

  const decided = plan?.status === "decided";
  const winnerId = plan?.winner_spot_id ?? null;
  const stage = plan?.stage ?? (decided ? "decided" : "final");
  const poolCount = plan?.pool_count ?? 1;

  const host = useHostCommands({ id, plan, setPlan, setPlanSpots, stage, spots, deleted, setDeleted, setNotice });
  const { isHost, deciding, advanceToFinal, decide } = host;
  // The live channels are held so leavePlan can close them BEFORE the page
  // moves on (use-plan-realtime.ts).
  const { dataChannelRef, cancelRefetchesRef } = usePlanRealtime({
    id, access, deleted, left, refetchVotes, refetchRsvps, refetchRatings, refetchPlanSpots, setPlan, setDeleted,
  });
  const { presentNames, presenceChannelRef } = usePlanPresence({ id, access, voterName, left });
  const { visitSaved, patchPlan, setRsvp, setCarpool, rateWinner } = useLastMile({
    id, plan, setPlan, hostToken: host.hostToken, runHostCommand: host.runHostCommand, voterName, participantHash, winnerId,
    rsvps, setRsvps, ratings, setRatings, refetchRsvps, refetchRatings, setNotice, reportParticipantFailure,
  });

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setNightMode(window.localStorage.getItem("deal-three:theme") === "night");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  // ── Tallies + this voter's picks (pure helpers in lib/tally.ts) ──
  const round = roundFor(stage, activePool);
  const { poolNumber: currentPoolNumber } = round;
  const { iVotedYes, toggleVote, voteUndo, setVoteUndo } = useVoteActions({
    id, votes, setVotes, voterName, participantHash, decided, round, spots, refetchVotes, setNotice, reportParticipantFailure,
  });
  const { confirmLeave, setConfirmLeave, leaving, leavePlan } = useLeavePlan({
    id, plan, setLeft, setDeleted, setNotice, presenceChannelRef, dataChannelRef, cancelRefetchesRef,
  });

  // Record the winner once when the decision arrives. A reopened plan (057)
  // goes back to open, so the latch resets -- otherwise the re-decide would
  // never record its winner.
  useEffect(() => {
    if (!decided) { revealFired.current = false; return; }
    if (!winnerId || revealFired.current) return;
    revealFired.current = true;
    addBeen(winnerId);
  }, [decided, winnerId]);

  function saveName(name: string) {
    localStorage.setItem(`voter:${id}`, name);
    setVoterName(name);
    setNotice(null);
  }

  // A name clash sends the person back to the name gate: the fix is theirs.
  function reportParticipantFailure(error: { code?: string; message?: string } | null, fallback: string) {
    const failure = participantFailure(error, fallback);
    setNotice(failure.notice);
    if (failure.nameTaken) {
      localStorage.removeItem(`voter:${id}`);
      setVoterName(null);
    }
  }

  const retryAccess = () => { setAccess("checking"); void runAccess(); };

  // SPECS.md §25.3 beat 3 — the round closes. Losers FOLD rather than
  // vanish, so the eye can follow where they went, and the winner then takes
  // the full row before handing off to WinnerReveal. Gravity lands into that
  // moment rather than competing with it.
  //
  // The two steps are separated by a timer rather than by an animation
  // callback, for §25.7's reason: if the fold never plays — reduced motion,
  // a backgrounded tab — the layout must still arrive at "winner alone, full
  // width". The timer owns the destination; the transition only plays the
  // journey.
  //
  // The beat only plays for someone who was HERE when the round closed.
  // Arriving at an already-decided plan and watching three cards appear and
  // then fold is a flash of content that immediately deletes itself — the
  // eye follows something that was never a decision being made. Those
  // viewers get the settled layout on their first render instead.
  //
  // Gated on `plan &&` because `decided` is false while the plan is still
  // loading, and without that every cold arrival would look like a round
  // closing.
  // Captured once, the first time a plan actually loads. Set DURING RENDER,
  // which is React's documented way to adjust state from new data — a ref
  // cannot be read during render in React 19, and doing this in an effect
  // trips the cascading-render rule this repo has hit three times. The
  // condition is self-limiting: it can only fire while the value is null.
  const [arrivedDecided, setArrivedDecided] = useState<boolean | null>(null);
  if (plan && arrivedDecided === null) {
    setArrivedDecided(plan.status === "decided");
  }
  const sawOpenRound = arrivedDecided === false;

  const [foldTimerDone, setFoldTimerDone] = useState(false);
  useEffect(() => {
    if (!decided || !sawOpenRound) return;
    const timer = setTimeout(() => setFoldTimerDone(true), 360);
    return () => clearTimeout(timer);
  }, [decided, sawOpenRound]);
  const foldDone = decided && (!sawOpenRound || foldTimerDone);

  // §25.3 beat 1: a voter's face flies from their seat onto the card they
  // chose. See components/vote/useFaceFlight.ts.
  useFaceFlight();

  const stateScreen = planStateScreen({
    deleted, left, plan, access, load, captchaStatus, setCaptchaStatus, onCaptchaVerify, retryAccess, setLoad, setReloadKey,
  });
  if (stateScreen) return stateScreen;

  // Hold the gate while a signed-in account's name resolves, so it doesn't flash.
  if (!voterName && !accountNameTried) {
    return <VoteState kind="loading" planTitle={plan?.title} />;
  }
  if (!voterName) {
    return (
      <main className={"vote-experience mx-auto grid min-h-dvh max-w-md place-items-center px-5"}>
        <NameGate planTitle={plan!.title} onSubmit={saveName} notice={notice} />
      </main>
    );
  }

  const voterCount = new Set(votes.map((v) => v.voter_name)).size;
  // Editable only before voting starts; the server enforces the same rule.
  const canEdit = plan!.status === "open" && stage === "pool" && votes.length === 0;
  // Everyone the client can see on this plan, you first. See the seats row.
  const roster = [...new Set([
    ...votes.map((v) => v.voter_name),
    ...rsvps.map((r) => r.voter_name),
    ...ratings.map((r) => r.voter_name),
    ...presentNames,
  ])].filter((name) => name !== voterName).sort((a, b) => a.localeCompare(b));
  roster.unshift(voterName);
  const pickedThisRound = new Set(votes.filter((v) => v.value && isInRound(v, round)).map((v) => v.voter_name));
  const othersHere = presentNames.filter((name) => name !== voterName);
  const winnerSpot = spots.find((s) => s.id === winnerId) ?? null;
  const visibleSpots = visibleSpotsFor(spots, planSpots, stage, activePool);
  const hasCurrentSelection = visibleSpots.some((spot) => iVotedYes(spot.id));
  const countFor = (spotId: string) => yesCount(votes, spotId, round);
  // Leader drives the After Dark sheen; agreement is §25.2 plan gravity,
  // recomputed per Realtime vote event rather than on a frame loop.
  const leaderId = leaderOf(visibleSpots.map((spot) => spot.id), countFor);
  const agreement = agreementOf(visibleSpots.map((spot) => countFor(spot.id)));

  const poolsChosenByMe = new Set(
    votes
      .filter((vote) => vote.voter_name === voterName && vote.value && (vote.phase ?? "final") === "pool")
      .map((vote) => vote.pool_number),
  );
  const allPoolsChosen = Array.from({ length: poolCount }, (_, index) => index + 1)
    .every((poolNumber) => poolsChosenByMe.has(poolNumber));

  return (
    <main className={"vote-experience mx-auto w-full max-w-4xl px-4 py-6 sm:py-10"}>
      <div
        ref={stageRef}
        className={[
          "vote-shell relative overflow-hidden border border-line bg-card p-4 sm:p-7",
          deciding ? "deck-shuffling" : "",
        ].join(" ")}
      >
        {/* Header */}
        <div className="vote-header flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold sm:text-3xl">{plan!.title}</h1>
            <p className="mt-1 text-sm text-muted">
              Hey {voterName}
            </p>
            {(plan!.budget_per_person != null || plan!.radius_km != null) && (
              <p className="vote-plan-constraints">
                {plan!.budget_per_person != null ? `Up to AED ${plan!.budget_per_person} per person` : "Any budget"}
                {plan!.radius_km != null ? ` · within ${plan!.radius_km} km of ${plan!.origin_label ?? "the starting point"}` : ""}
              </p>
            )}
            {/* reopened_at is set only by reopen_plan (057); a re-decide flips
                status, so this stops showing without clearing it. */}
            {plan!.status === "open" && plan!.reopened_at && (
              <p className="vote-reopened">This plan was reopened. Check your RSVP once a new place is picked.</p>
            )}
            {!decided && (
              <RoundLabel stage={stage === "pool" ? "pool" : "final"} activePool={activePool} poolCount={poolCount} nightMode={nightMode} />
            )}
            {/* §26.1: the group, not just the people who acted. */}
            {!decided && roster.length > 1 && (
              <VoteSeats roster={roster} voterName={voterName} picked={pickedThisRound} othersHere={othersHere} />
            )}
          </div>
          <span className="vote-deadline shrink-0 whitespace-nowrap px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-grape">
            {decided ? "Decided" : closesLabel(plan!.deadline)}
          </span>
        </div>

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
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            {!isHost ? (
              // advanceToFinal/decide are host-only server-side
              // (execute_plan_command checks hostToken for every command) —
              // a non-host tapping a "Continue" button here would just get an
              // optimistic flash that reverts with a generic error. Voting
              // itself is unaffected; only the round-advance control is gated.
              <p className="flex-1 self-center text-sm font-medium text-muted">
                Waiting for the host to continue.
              </p>
            ) : stage === "pool" ? (
              <button
                type="button"
                onClick={() => {
                  setRoundDir(1);
                  if (activePool < poolCount) setActivePool((pool) => pool + 1);
                  else void advanceToFinal();
                }}
                disabled={deciding || !hasCurrentSelection || (activePool === poolCount && !allPoolsChosen)}
                className="vote-primary-action flex-1 rounded-2xl border-2 border-ink font-display text-lg font-extrabold disabled:opacity-40"
              >
                {deciding
                  ? "Building the shortlist…"
                  : activePool < poolCount
                    ? `Continue to pool ${activePool + 1}`
                    : "Build the final shortlist"}
              </button>
            ) : (
              <button
                type="button"
                onClick={decide}
                disabled={deciding || !hasCurrentSelection}
                className="vote-primary-action flex-1 rounded-2xl border-2 border-ink font-display text-lg font-extrabold disabled:opacity-40"
              >
                {deciding ? "Choosing…" : "Choose the final place"}
              </button>
            )}
          </div>
          <p className="vote-action-hint" aria-live="polite">
            {!hasCurrentSelection
              ? "Choose one place to continue. You can change your choice before moving on."
              : !isHost
                ? "Your vote is in. The host will move things along once everyone’s ready."
                : stage === "pool" && activePool < poolCount
                  ? `Pool ${activePool} is set. Continue when you’re ready.`
                  : stage === "pool"
                    ? "All pools are set. Build the final shortlist when everyone has had a chance to vote."
                    : "The final shortlist is ready. Choose the place the group should visit."}
          </p>
          <ShareActions title={plan?.title ?? null} />
          <HostPlanControls host={host} plan={plan} voterCount={voterCount} canEdit={canEdit} />
          </>
        ) : (
          winnerSpot && (
            <DecidedPlan
              plan={plan!}
              winner={winnerSpot}
              voterName={voterName}
              isHost={isHost}
              rsvps={rsvps}
              ratings={ratings}
              onSetTime={(iso) => patchPlan({ event_time: iso })}
              roster={roster}
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

        {notice && (
          <p role="alert" className="mt-3 text-sm font-medium text-punch-text">
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

      <p className="mt-4 px-1 text-center text-xs text-muted">
        No account needed. Choose one place from each pool, then vote on the final three.
      </p>
    </main>
  );
}
