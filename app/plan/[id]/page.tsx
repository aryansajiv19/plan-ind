"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { addBeen } from "@/lib/device";
import { participantTokenHash } from "@/lib/participant";
import { coordinatesForArea, distanceKm } from "@/lib/dubai-areas";
import type { Plan, PlanSpot, Rating, Rsvp, Spot, Vote } from "@/lib/types";
import OptionCard from "@/components/OptionCard";
import NameGate from "@/components/NameGate";
import DecidedPlan from "@/components/DecidedPlan";
import ConfettiCanvas, { type ConfettiHandle } from "@/components/ConfettiCanvas";

type Load = "loading" | "ready" | "notfound" | "error";

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

  const [load, setLoad] = useState<Load>("loading");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [planSpots, setPlanSpots] = useState<PlanSpot[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [rsvps, setRsvps] = useState<Rsvp[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [voterName, setVoterName] = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [reloadKey, setReloadKey] = useState(0); // bump to retry the load
  const [nightMode, setNightMode] = useState(false);
  const [activePool, setActivePool] = useState(1);
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [participantHash, setParticipantHash] = useState<string | null>(null);

  const confettiRef = useRef<ConfettiHandle>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const revealFired = useRef(false);

  const decided = plan?.status === "decided";
  const winnerId = plan?.winner_spot_id ?? null;
  const stage = plan?.stage ?? (decided ? "decided" : "final");
  const poolCount = plan?.pool_count ?? 1;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setNightMode(window.localStorage.getItem("deal-three:theme") === "night");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  // ── Load plan + its three spots + existing votes ─────────────────
  const refetchVotes = useCallback(async () => {
    const { data } = await supabase.from("votes").select("*").eq("plan_id", id);
    if (data) setVotes(data as Vote[]);
  }, [id]);

  useEffect(() => {
    let active = true;
    void participantTokenHash(id).then((hash) => { if (active) setParticipantHash(hash); });
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    const saved = localStorage.getItem(`plan-host:${id}`);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setHostToken(saved);
  }, [id]);

  const runHostCommand = useCallback(async (command: "advance" | "decide" | "patch", patch: Partial<Plan> = {}) => {
    if (!hostToken) return null;
    const response = await fetch(`/api/plans/${id}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hostToken, command, patch }),
    });
    const result = await response.json() as { plan?: Plan; finalists?: string[]; error?: string };
    if (!response.ok || !result.plan) throw new Error(result.error ?? "That plan command could not be saved.");
    return result;
  }, [hostToken, id]);

  const refetchRsvps = useCallback(async () => {
    const { data } = await supabase.from("rsvps").select("*").eq("plan_id", id);
    if (data) setRsvps(data as Rsvp[]);
  }, [id]);

  const refetchRatings = useCallback(async () => {
    const { data } = await supabase.from("ratings").select("*").eq("plan_id", id);
    if (data) setRatings(data as Rating[]);
  }, [id]);

  const refetchPlanSpots = useCallback(async () => {
    const { data } = await supabase.from("plan_spots").select("*").eq("plan_id", id);
    if (data) setPlanSpots(data as PlanSpot[]);
  }, [id]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: planRow, error: planErr } = await supabase
        .from("plans")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (!active) return;
      if (planErr) {
        setLoad("error");
        return;
      }
      if (!planRow) {
        setLoad("notfound");
        return;
      }

      const { data: links, error: linksErr } = await supabase
        .from("plan_spots")
        .select("*")
        .eq("plan_id", id);
      const spotIds = (links ?? []).map((l) => l.spot_id);

      const { data: spotRows, error: spotsErr } = spotIds.length
        ? await supabase.from("spots").select("*").in("id", spotIds)
        : { data: [], error: null };
      // Preserve the dealt order.
      const ordered = spotIds
        .map((sid) => (spotRows ?? []).find((s) => s.id === sid))
        .filter(Boolean) as Spot[];

      if (!active) return;
      // A plan should always have its dealt spots. If any query failed or the
      // spots came back short, treat it as a transient error and let the user
      // retry — never render a broken, cardless stage.
      if (linksErr || spotsErr || ordered.length === 0) {
        setLoad("error");
        return;
      }
      setPlan(planRow as Plan);
      setSpots(ordered);
      setPlanSpots((links ?? []) as PlanSpot[]);
      await refetchVotes();
      await refetchRsvps();
      await refetchRatings();
      setLoad("ready");
    })();
    return () => {
      active = false;
    };
  }, [id, refetchVotes, refetchRsvps, refetchRatings, reloadKey]);

  // ── Restore this voter's name (once, per plan) ───────────────────
  useEffect(() => {
    // Sync from localStorage on mount — can't use a useState initializer
    // because localStorage doesn't exist during SSR.
    const saved = localStorage.getItem(`voter:${id}`);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setVoterName(saved);
  }, [id]);

  // ── Realtime: live votes + live "decided" for everyone ───────────
  useEffect(() => {
    const channel = supabase
      .channel(`plan:${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "votes", filter: `plan_id=eq.${id}` },
        () => refetchVotes(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "plans", filter: `id=eq.${id}` },
        (payload) => setPlan(payload.new as Plan),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rsvps", filter: `plan_id=eq.${id}` },
        () => refetchRsvps(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ratings", filter: `plan_id=eq.${id}` },
        () => refetchRatings(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "plan_spots", filter: `plan_id=eq.${id}` },
        () => refetchPlanSpots(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, refetchVotes, refetchRsvps, refetchRatings, refetchPlanSpots]);

  // ── Tallies + this voter's picks ─────────────────────────────────
  const currentPhase = stage === "pool" ? "pool" : "final";
  const currentPoolNumber = stage === "pool" ? activePool : 0;
  const voteIsInCurrentRound = (vote: Vote) =>
    (vote.phase ?? "final") === currentPhase &&
    (vote.pool_number ?? 0) === currentPoolNumber;
  const yesCount = (spotId: string) =>
    votes.filter((v) => v.spot_id === spotId && v.value && voteIsInCurrentRound(v)).length;
  const iVotedYes = (spotId: string) =>
    votes.some(
      (v) => v.spot_id === spotId && v.voter_name === voterName && (!v.participant_token_hash || v.participant_token_hash === participantHash) && v.value && voteIsInCurrentRound(v),
    );

  // One choice per voter per pool/final. Picking another card replaces it.
  async function toggleVote(spotId: string) {
    if (!voterName || decided) return;
    if (!participantHash) { setNotice("Preparing your private voting session…"); return; }
    const next = !iVotedYes(spotId);

    const prev = votes;
    setVotes((cur) => {
      const rest = cur.filter(
        (v) => !(
          v.voter_name === voterName &&
          (!v.participant_token_hash || v.participant_token_hash === participantHash) &&
          (v.phase ?? "final") === currentPhase &&
          (v.pool_number ?? 0) === currentPoolNumber
        ),
      );
      return next ? [
        ...rest,
        {
          id: `local-${currentPhase}-${currentPoolNumber}-${spotId}-${voterName}`,
          plan_id: id,
          spot_id: spotId,
          voter_name: voterName,
          value: true,
          phase: currentPhase,
          pool_number: currentPoolNumber,
          participant_token_hash: participantHash,
        },
      ] : rest;
    });

    const { error } = await supabase.rpc("cast_plan_vote", {
      p_plan_id: id,
      p_spot_id: spotId,
      p_voter_name: voterName,
      p_value: next,
      p_phase: currentPhase,
      p_pool_number: currentPoolNumber,
      p_participant_token_hash: participantHash,
    });
    if (error) {
      setVotes(prev); // roll back
      setNotice("That vote didn't save. Check your connection and tap again.");
    } else {
      setNotice(null);
    }
  }

  const advanceToFinal = useCallback(async () => {
    if (!plan || plan.status !== "open" || stage !== "pool") return;
    if (hostToken) {
      setDeciding(true);
      try {
        const result = await runHostCommand("advance");
        if (result?.finalists) setPlanSpots((current) => current.map((link) => ({ ...link, advanced: result.finalists!.includes(link.spot_id) })));
        if (result?.plan) setPlan(result.plan);
        setNotice(null);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "The shortlist didn’t save. Try again.");
      } finally {
        setDeciding(false);
      }
      return;
    }
    const { data: fresh } = await supabase
      .from("votes")
      .select("spot_id,value,phase,pool_number")
      .eq("plan_id", id)
      .eq("phase", "pool");

    const finalists: string[] = [];
    for (let poolNumber = 1; poolNumber <= poolCount; poolNumber += 1) {
      const candidateIds = planSpots
        .filter((link) => (link.pool_number ?? 1) === poolNumber)
        .map((link) => link.spot_id);
      if (candidateIds.length === 0) continue;
      const ranked = candidateIds
        .map((spotId) => ({
          spotId,
          votes: (fresh ?? []).filter(
            (vote) => vote.spot_id === spotId && vote.value && (vote.pool_number ?? 0) === poolNumber,
          ).length,
        }))
        .sort((a, b) => b.votes - a.votes || a.spotId.localeCompare(b.spotId));
      finalists.push(ranked[0].spotId);
    }
    if (finalists.length !== poolCount) {
      setNotice("The final shortlist couldn’t be built yet. Try again.");
      return;
    }

    setDeciding(true);
    await supabase.from("plan_spots").update({ advanced: false }).eq("plan_id", id);
    const { error: advanceError } = await supabase
      .from("plan_spots")
      .update({ advanced: true })
      .eq("plan_id", id)
      .in("spot_id", finalists);
    const { error: stageError } = await supabase
      .from("plans")
      .update({ stage: "final" })
      .eq("id", id)
      .eq("status", "open");
    if (advanceError || stageError) {
      setNotice("The shortlist didn’t save. Check your connection and try again.");
      setDeciding(false);
      return;
    }
    setPlanSpots((current) => current.map((link) => ({ ...link, advanced: finalists.includes(link.spot_id) })));
    setPlan((current) => current ? { ...current, stage: "final" } : current);
    setNotice(null);
    setDeciding(false);
  }, [id, plan, planSpots, poolCount, stage, hostToken, runHostCommand]);

  // Finalists only; stable spot-id tie-break means every client picks the same.
  const decide = useCallback(async () => {
    if (!plan || plan.status !== "open" || spots.length === 0) return;
    if (hostToken) {
      setDeciding(true);
      try {
        const result = await runHostCommand("decide");
        if (result?.plan) setPlan(result.plan);
        setNotice(null);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "The plan couldn’t be decided. Try again.");
      } finally {
        setDeciding(false);
      }
      return;
    }

    const advanced = planSpots.filter((link) => link.advanced).map((link) => link.spot_id);
    const candidates = stage === "final" && advanced.length > 0
      ? spots.filter((spot) => advanced.includes(spot.id))
      : spots;

    // Read fresh tallies so the call is correct even from a stale client
    // (e.g. a deadline firing hours later).
    const { data: fresh } = await supabase
      .from("votes")
      .select("spot_id,value")
      .eq("plan_id", id)
      .eq("phase", "final")
      .eq("pool_number", 0);
    const counts = candidates.map(
      (s) => (fresh ?? []).filter((v) => v.spot_id === s.id && v.value).length,
    );
    const max = Math.max(...counts);
    const winner = candidates
      .filter((_, i) => counts[i] === max)
      .sort((a, b) => a.id.localeCompare(b.id))[0];

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setDeciding(true);
    const commit = async () => {
      // Guard the race: only the first "decide" wins; then read back
      // the authoritative result so everyone reveals the same spot.
      await supabase
        .from("plans")
        .update({ status: "decided", stage: "decided", winner_spot_id: winner.id })
        .eq("id", id)
        .eq("status", "open");
      const { data } = await supabase
        .from("plans")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (data) setPlan(data as Plan);
      setDeciding(false);
    };
    if (reduce) commit();
    else setTimeout(commit, 700);
  }, [plan, spots, planSpots, stage, id, hostToken, runHostCommand]);

  // ── Deadline auto-pick ───────────────────────────────────────────
  useEffect(() => {
    if (!plan || plan.status !== "open" || !plan.deadline) return;
    const ms = new Date(plan.deadline).getTime() - Date.now();
    // setTimeout(…, 0) defers even a past deadline, so we never call
    // setState synchronously in the effect body.
    const t = setTimeout(() => {
      if (stage === "pool") void advanceToFinal();
      else void decide();
    }, Math.max(0, ms));
    return () => clearTimeout(t);
  }, [plan, stage, decide, advanceToFinal]);

  // ── The reveal: confetti on the winner, once ─────────────────────
  useEffect(() => {
    if (!decided || !winnerId || revealFired.current) return;
    revealFired.current = true;
    addBeen(winnerId); // remember on this device — feeds "haven't been yet"
    const el = cardRefs.current[winnerId];
    const stage = stageRef.current;
    if (el && stage) {
      const b = el.getBoundingClientRect();
      const s = stage.getBoundingClientRect();
      confettiRef.current?.burst(b.left - s.left + b.width / 2, b.top - s.top + 20);
    }
  }, [decided, winnerId]);

  function saveName(name: string) {
    localStorage.setItem(`voter:${id}`, name);
    setVoterName(name);
  }

  // ── The last mile: set time, RSVP, claim/mark booking ────────────
  async function patchPlan(fields: Partial<Plan>) {
    if (!plan) return;
    setPlan({ ...plan, ...fields }); // optimistic
    if (hostToken) {
      try {
        const result = await runHostCommand("patch", fields);
        if (result?.plan) setPlan(result.plan);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "That didn't save. Check your connection and try again.");
      }
      return;
    }
    const { error } = await supabase.from("plans").update(fields).eq("id", id);
    if (error) setNotice("That didn't save. Check your connection and try again.");
  }

  async function setRsvp(choice: "coming" | "maybe" | "no") {
    if (!voterName || !participantHash) return;
    const mine = rsvps.find((r) => r.voter_name === voterName);
    const nextComing = choice === "coming";
    setRsvps((cur) => [
      ...cur.filter((r) => r.voter_name !== voterName),
      { id: mine?.id ?? `local-${voterName}`, plan_id: id, voter_name: voterName, coming: nextComing, choice, participant_token_hash: participantHash },
    ]);
    const { error } = await supabase.rpc("set_plan_rsvp", {
      p_plan_id: id,
      p_voter_name: voterName,
      p_coming: nextComing,
      p_choice: choice,
      p_participant_token_hash: participantHash,
    });
    if (error) {
      await refetchRsvps(); // reconcile on failure
      setNotice("Couldn't update your RSVP. Try again.");
    }
  }

  // Rate the winner after the visit. First tap fills in a sensible "again"
  // so one interaction writes a valid row; each control merges with the rest.
  async function rateWinner(partial: { stars?: number; again?: boolean }) {
    if (!voterName || !winnerId || !participantHash) return;
    const mine = ratings.find((r) => r.voter_name === voterName);
    const stars = partial.stars ?? mine?.stars ?? 5;
    const again = partial.again ?? mine?.again ?? stars >= 4;
    setRatings((cur) => [
      ...cur.filter((r) => r.voter_name !== voterName),
      { id: mine?.id ?? `local-${voterName}`, plan_id: id, spot_id: winnerId, voter_name: voterName, stars, again, participant_token_hash: participantHash },
    ]);
    const { error } = await supabase.rpc("rate_plan", {
      p_plan_id: id,
      p_spot_id: winnerId,
      p_voter_name: voterName,
      p_stars: stars,
      p_again: again,
      p_participant_token_hash: participantHash,
    });
    if (error) {
      await refetchRatings();
      setNotice("Couldn't save your rating. Try again.");
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      return; // clipboard blocked — leave the button unchanged
    }
  }

  // ── States ───────────────────────────────────────────────────────
  if (load === "loading") {
    return (
      <main className={`vote-experience ${nightMode ? "vote-experience--night" : ""} mx-auto grid min-h-dvh max-w-md place-items-center px-5`}>
        <p className="text-muted">Loading the plan…</p>
      </main>
    );
  }

  if (load === "notfound") {
    return (
      <main className={`vote-experience ${nightMode ? "vote-experience--night" : ""} mx-auto grid min-h-dvh max-w-md place-items-center px-5 text-center`}>
        <div>
          <h1 className="text-3xl font-extrabold">This link’s gone cold</h1>
          <p className="mt-3 text-muted">
            The plan isn’t here anymore. Ask whoever sent it for a fresh link.
          </p>
        </div>
      </main>
    );
  }

  if (load === "error") {
    return (
      <main className={`vote-experience ${nightMode ? "vote-experience--night" : ""} mx-auto grid min-h-dvh max-w-md place-items-center px-5 text-center`}>
        <div>
          <h1 className="text-3xl font-extrabold">Couldn’t load the spots</h1>
          <p className="mt-3 text-muted">
            The connection dropped mid-deal. Try again.
          </p>
          <button
            type="button"
            onClick={() => {
              setLoad("loading");
              setReloadKey((k) => k + 1);
            }}
            className="vote-primary-action mt-6 rounded-2xl border-2 border-ink bg-grape px-6 py-3 font-display font-extrabold text-white"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  if (!voterName) {
    return (
      <main className={`vote-experience ${nightMode ? "vote-experience--night" : ""} mx-auto grid min-h-dvh max-w-md place-items-center px-5`}>
        <NameGate planTitle={plan!.title} onSubmit={saveName} />
      </main>
    );
  }

  const voters = new Set(votes.map((v) => v.voter_name)).size;
  const winnerSpot = spots.find((s) => s.id === winnerId) ?? null;
  const advancedIds = planSpots.filter((link) => link.advanced).map((link) => link.spot_id);
  const visibleSpots = stage === "pool"
    ? spots.filter((spot) => planSpots.some(
        (link) => link.spot_id === spot.id && (link.pool_number ?? 1) === activePool,
      ))
    : advancedIds.length > 0
      ? spots.filter((spot) => advancedIds.includes(spot.id))
      : spots;
  const hasCurrentSelection = visibleSpots.some((spot) => iVotedYes(spot.id));
  const poolsChosenByMe = new Set(
    votes
      .filter((vote) => vote.voter_name === voterName && vote.value && (vote.phase ?? "final") === "pool")
      .map((vote) => vote.pool_number),
  );
  const allPoolsChosen = Array.from({ length: poolCount }, (_, index) => index + 1)
    .every((poolNumber) => poolsChosenByMe.has(poolNumber));

  return (
    <main className={`vote-experience ${nightMode ? "vote-experience--night" : ""} mx-auto w-full max-w-4xl px-4 py-6 sm:py-10`}>
      <div
        ref={stageRef}
        className={[
          "vote-shell relative overflow-hidden border border-line bg-card p-4 sm:p-7",
          deciding ? "deck-shuffling" : "",
        ].join(" ")}
      >
        <ConfettiCanvas ref={confettiRef} />

        {/* Header */}
        <div className="vote-header flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold sm:text-3xl">{plan!.title}</h1>
            <p className="mt-1 text-sm text-muted">
              Hey {voterName} · {voters} {voters === 1 ? "person" : "people"} voting
            </p>
            {(plan!.budget_per_person != null || plan!.radius_km != null) && (
              <p className="vote-plan-constraints">
                {plan!.budget_per_person != null ? `Up to AED ${plan!.budget_per_person} per person` : "Any budget"}
                {plan!.radius_km != null ? ` · within ${plan!.radius_km} km of ${plan!.origin_label ?? "the starting point"}` : ""}
              </p>
            )}
            {!decided && (
              <p className="vote-round-label">
                {stage === "pool" ? `Pool ${activePool} of ${poolCount} · choose one` : "Final shortlist · choose one"}
              </p>
            )}
          </div>
          <span className="vote-deadline shrink-0 whitespace-nowrap px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-grape">
            {decided ? "Decided" : closesLabel(plan!.deadline)}
          </span>
        </div>

        {stage === "pool" && !decided && (
          <nav className="vote-pool-progress" aria-label="Voting pools">
            {Array.from({ length: poolCount }, (_, index) => index + 1).map((poolNumber) => (
              <button
                key={poolNumber}
                type="button"
                onClick={() => setActivePool(poolNumber)}
                aria-current={activePool === poolNumber ? "step" : undefined}
                data-complete={poolsChosenByMe.has(poolNumber) || undefined}
              >
                Pool {poolNumber}
              </button>
            ))}
          </nav>
        )}

        {/* Three places in the current pool, or the three finalists. */}
        <div className="vote-options-grid mt-6 grid gap-3.5 sm:grid-cols-3">
          {visibleSpots.map((spot) => (
            <div key={spot.id} ref={(el) => { cardRefs.current[spot.id] = el; }}>
              <OptionCard
                spot={spot}
                yesCount={yesCount(spot.id)}
                voted={iVotedYes(spot.id)}
                isWinner={winnerId === spot.id}
                decided={decided}
                distanceKm={plan!.origin_latitude != null && plan!.origin_longitude != null
                  ? (() => {
                      const destination = spot.latitude != null && spot.longitude != null
                        ? { latitude: spot.latitude, longitude: spot.longitude }
                        : coordinatesForArea(spot.area);
                      return destination ? distanceKm({ latitude: plan!.origin_latitude!, longitude: plan!.origin_longitude! }, destination) : null;
                    })()
                  : null}
                onToggle={() => toggleVote(spot.id)}
              />
            </div>
          ))}
        </div>

        {/* Controls / result */}
        {!decided ? (
          <>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            {stage === "pool" ? (
              <button
                type="button"
                onClick={() => {
                  if (activePool < poolCount) setActivePool((pool) => pool + 1);
                  else void advanceToFinal();
                }}
                disabled={deciding || !hasCurrentSelection || (activePool === poolCount && !allPoolsChosen)}
                className="vote-primary-action flex-1 rounded-2xl border-2 border-ink bg-punch px-6 py-3.5 font-display text-lg font-extrabold text-white disabled:opacity-40"
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
                className="vote-primary-action flex-1 rounded-2xl border-2 border-ink bg-punch px-6 py-3.5 font-display text-lg font-extrabold text-white disabled:opacity-40"
              >
                {deciding ? "Choosing…" : "Choose the final place"}
              </button>
            )}
            <button
              type="button"
              onClick={copyLink}
              className="vote-secondary-action rounded-2xl border-2 border-ink bg-card px-6 py-3.5 font-display font-extrabold"
            >
              {copied ? "Link copied" : "Copy link"}
            </button>
          </div>
          <p className="vote-action-hint" aria-live="polite">
            {!hasCurrentSelection
              ? "Choose one place to continue. You can change your choice before moving on."
              : stage === "pool" && activePool < poolCount
                ? `Pool ${activePool} is set. Continue when you’re ready.`
                : stage === "pool"
                  ? "All pools are set. Build the final shortlist when everyone has had a chance to vote."
                  : "The final shortlist is ready. Choose the place the group should visit."}
          </p>
          </>
        ) : (
          winnerSpot && (
            <DecidedPlan
              plan={plan!}
              winner={winnerSpot}
              voterName={voterName}
              rsvps={rsvps}
              ratings={ratings}
              onSetTime={(iso) => patchPlan({ event_time: iso })}
              onSetRsvp={setRsvp}
              onClaimBooking={() => patchPlan({ booking_owner: voterName })}
              onMarkBooked={() => patchPlan({ booked: true })}
              onRate={rateWinner}
            />
          )
        )}

        {notice && (
          <p role="alert" className="mt-3 text-sm font-medium text-punch">
            {notice}
          </p>
        )}
      </div>

      <p className="mt-4 px-1 text-center text-xs text-muted">
        No account needed. Choose one place from each pool, then vote on the final three.
      </p>
    </main>
  );
}
