"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase, bootstrapPlanAccess, type PlanAccessDenial } from "@/lib/supabase";
import { addBeen } from "@/lib/device";
import { logVisit } from "@/lib/social";
import { avatarStyle, initialsOf } from "@/lib/avatar";
import { participantTokenHash } from "@/lib/participant";
import { secureJsonFetch } from "@/lib/security/csrf-client";
import { coordinatesForArea, distanceKm } from "@/lib/dubai-areas";
import type { Plan, PlanSpot, Rating, Rsvp, Spot, Vote } from "@/lib/types";
import { haptic } from "@/lib/interaction";
import CountUp from "@/components/CountUp";
import OptionCard from "@/components/OptionCard";
import NameGate from "@/components/NameGate";
import DecidedPlan from "@/components/DecidedPlan";
import Turnstile from "@/components/Turnstile";
import VoteState from "@/components/VoteState";

type Load = "loading" | "ready" | "notfound" | "error";
// "checking" = access not resolved yet; "ready" = membership claimed; any
// PlanAccessDenial = a specific reason bootstrapPlanAccess handed back.
type Access = "checking" | "ready" | PlanAccessDenial;

function closesLabel(deadline: string | null): string {
  if (!deadline) return "Open";
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return "Voting closed";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h >= 1 ? `Closes in ${h}h` : `Closes in ${m}m`;
}


// Roman round markers are After Dark's, and night-only — "III" does not fit
// the 2.1rem day dot. Always paired with the arabic original for assistive
// tech, which reads "Round 3" properly and "Round III" as "Round eye-eye-eye".
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const roman = (n: number) => ROMAN[n - 1] ?? String(n);

export default function VotePage() {
  const { id } = useParams<{ id: string }>();

  const [load, setLoad] = useState<Load>("loading");
  const [access, setAccess] = useState<Access>("checking");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [planSpots, setPlanSpots] = useState<PlanSpot[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [rsvps, setRsvps] = useState<Rsvp[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [voterName, setVoterName] = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [visitSaved, setVisitSaved] = useState<"saved" | "failed" | null>(null);
  const [presentNames, setPresentNames] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [reloadKey, setReloadKey] = useState(0); // bump to retry the load
  const [nightMode, setNightMode] = useState(false);
  const [activePool, setActivePool] = useState(1);
  // Which way the next round should enter from. Set at the two places that
  // change rounds rather than derived, so going back to round 1 from round 3
  // slides in from the left instead of pretending it is progress.
  const [roundDir, setRoundDir] = useState(1);
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [participantHash, setParticipantHash] = useState<string | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const revealFired = useRef(false);

  const decided = plan?.status === "decided";
  const winnerId = plan?.winner_spot_id ?? null;
  const stage = plan?.stage ?? (decided ? "decided" : "final");
  const poolCount = plan?.pool_count ?? 1;
  // Whoever created the plan, and only them — execute_plan_command enforces
  // this server-side for every command (advance/decide/patch), so this flag
  // is UI truthfulness, not the actual gate. See advanceToFinal/decide/patchPlan.
  const isHost = Boolean(hostToken);

  // All the "get a session, redeem the share id" logic lives in
  // bootstrapPlanAccess (lib/supabase.ts) so it returns a typed reason rather
  // than throwing — each reason gets its own screen below.
  const runAccess = useCallback(async (captchaToken?: string) => {
    const result = await bootstrapPlanAccess(id, captchaToken);
    setAccess(result.ok ? "ready" : result.reason);
  }, [id]);
  // Stable identity so <Turnstile>'s effect (keyed on `onVerify`) doesn't
  // tear down and rebuild the live widget on every unrelated re-render of
  // this page while the captcha screen is showing.
  const onCaptchaVerify = useCallback((token: string) => {
    if (token) void runAccess(token);
  }, [runAccess]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void runAccess());
    return () => window.cancelAnimationFrame(frame);
  }, [runAccess]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setNightMode(window.localStorage.getItem("deal-three:theme") === "night");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  // ── Load plan + its three spots + existing votes ─────────────────
  // Realtime fires refetchVotes/Rsvps/Ratings/PlanSpots directly off
  // postgres_changes with no request sequencing. Two writes in quick
  // succession — normal in a live group session — can have their refetches
  // resolve out of order; without a guard the stale response wins and a
  // just-rendered row silently disappears until the next unrelated change
  // happens to trigger another refetch. One counter per fetch kind, bumped
  // before the await and checked after, discards a response once a newer
  // request for the same kind has already started.
  const fetchSeq = useRef({ votes: 0, rsvps: 0, ratings: 0, planSpots: 0 });

  const refetchVotes = useCallback(async () => {
    const seq = ++fetchSeq.current.votes;
    const { data } = await supabase.from("votes").select("*").eq("plan_id", id);
    if (data && seq === fetchSeq.current.votes) setVotes(data as Vote[]);
  }, [id]);

  useEffect(() => {
    if (access !== "ready") return;
    let active = true;
    void participantTokenHash(id).then((hash) => { if (active) setParticipantHash(hash); });
    return () => { active = false; };
  }, [access, id]);

  useEffect(() => {
    const saved = localStorage.getItem(`plan-host:${id}`);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setHostToken(saved);
  }, [id]);

  const runHostCommand = useCallback(async (command: "advance" | "decide" | "patch", patch: Partial<Plan> = {}) => {
    if (!hostToken) return null;
    const response = await secureJsonFetch(`/api/plans/${id}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hostToken, command, patch }),
    });
    const result = await response.json() as { plan?: Plan; finalists?: string[]; error?: string };
    if (!response.ok || !result.plan) throw new Error(result.error ?? "That plan command could not be saved.");
    return result;
  }, [hostToken, id]);

  const refetchRsvps = useCallback(async () => {
    const seq = ++fetchSeq.current.rsvps;
    const { data } = await supabase.from("rsvps").select("*").eq("plan_id", id);
    if (data && seq === fetchSeq.current.rsvps) setRsvps(data as Rsvp[]);
  }, [id]);

  const refetchRatings = useCallback(async () => {
    const seq = ++fetchSeq.current.ratings;
    const { data } = await supabase.from("ratings").select("*").eq("plan_id", id);
    if (data && seq === fetchSeq.current.ratings) setRatings(data as Rating[]);
  }, [id]);

  const refetchPlanSpots = useCallback(async () => {
    const seq = ++fetchSeq.current.planSpots;
    const { data } = await supabase.from("plan_spots").select("*").eq("plan_id", id);
    if (data && seq === fetchSeq.current.planSpots) setPlanSpots(data as PlanSpot[]);
  }, [id]);

  useEffect(() => {
    // Post-020 `plans` is membership-scoped: reading before claim_plan_access
    // has redeemed the share id returns an empty set, which is indistinguishable
    // from a deleted plan. Wait for access, like every other effect here.
    if (access !== "ready") return;
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
  }, [access, id, refetchVotes, refetchRsvps, refetchRatings, reloadKey]);

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
    if (access !== "ready") return;
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
  }, [access, id, refetchVotes, refetchRsvps, refetchRatings, refetchPlanSpots]);

  // ── Who else has this plan open right now ────────────────────────
  // A separate channel from the data subscriptions above: presence depends on
  // the typed name, and folding it in would tear down every postgres_changes
  // listener each time the name resolves.
  //
  // The presence key is a throwaway per-tab id, NOT the participant token
  // hash. Presence keys and payloads are broadcast to every subscriber on the
  // channel, so keying by the token would hand every link visitor the
  // credential the write RPCs authorise against. The payload carries the
  // typed name only — exactly what the vote list already shows publicly.
  useEffect(() => {
    if (access !== "ready" || !voterName) return;
    const sessionKey = crypto.randomUUID();
    const channel = supabase.channel(`plan:${id}:presence`, {
      config: { private: true, presence: { key: sessionKey } },
    });
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ name?: string }>();
        const names = Object.values(state)
          .flat()
          .map((entry) => entry.name)
          .filter((name): name is string => Boolean(name));
        setPresentNames([...new Set(names)].sort((a, b) => a.localeCompare(b)));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track({ name: voterName });
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [access, id, voterName]);

  // ── Tallies + this voter's picks ─────────────────────────────────
  const currentPhase = stage === "pool" ? "pool" : "final";
  const currentPoolNumber = stage === "pool" ? activePool : 0;
  const voteIsInCurrentRound = (vote: Vote) =>
    (vote.phase ?? "final") === currentPhase &&
    (vote.pool_number ?? 0) === currentPoolNumber;
  const yesCount = (spotId: string) =>
    votes.filter((v) => v.spot_id === spotId && v.value && voteIsInCurrentRound(v)).length;
  // Sorted so a re-render never reshuffles the faces; only genuinely new
  // names should move, and OptionCard decides that by diffing this list.
  const votersFor = (spotId: string) =>
    votes
      .filter((v) => v.spot_id === spotId && v.value && voteIsInCurrentRound(v))
      .map((v) => v.voter_name)
      .sort((a, b) => a.localeCompare(b));
  const iVotedYes = (spotId: string) =>
    votes.some(
      (v) => v.spot_id === spotId && v.voter_name === voterName && (!v.participant_token_hash || v.participant_token_hash === participantHash) && v.value && voteIsInCurrentRound(v),
    );

  // One choice per voter per pool/final. Picking another card replaces it.
  async function toggleVote(spotId: string) {
    if (!voterName || decided) return;
    if (!participantHash) { setNotice("Preparing your private voting session…"); return; }
    const next = !iVotedYes(spotId);
    // Never the only feedback: navigator.vibrate is unsupported on iOS
    // Safari, which is most of this audience. The card's own spring is what
    // actually confirms the pick; this is a bonus where it exists.
    haptic(next ? 10 : 6);

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
      // Reconcile with the server rather than restoring the pre-optimistic
      // snapshot: a realtime event for someone else's vote can land while
      // this RPC is in flight, and setVotes(prev) would silently discard it
      // along with the failed attempt. Same pattern as setRsvp/rateWinner.
      await refetchVotes();
      setNotice("That vote didn't save. Check your connection and tap again.");
    } else {
      setNotice(null);
    }
  }

  // Both transitions run entirely inside execute_plan_command: it holds the
  // row lock, does the tally and applies the same stable spot-id tie-break.
  // The client used to recompute all of that to feed a direct-write fallback,
  // which migration 015 revoked — one tally, server-side, is the whole point.
  const advanceToFinal = useCallback(async () => {
    if (!plan || plan.status !== "open" || stage !== "pool") return;
    if (!hostToken) {
      setNotice("Only the person who started this plan can close the rounds.");
      return;
    }
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
  }, [plan, stage, hostToken, runHostCommand]);

  const decide = useCallback(async () => {
    if (!plan || plan.status !== "open" || spots.length === 0) return;
    if (!hostToken) {
      setNotice("Only the person who started this plan can decide it.");
      return;
    }
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
  }, [plan, spots.length, hostToken, runHostCommand]);

  // ── Deadline auto-pick ───────────────────────────────────────────
  // Host only. Everyone else receives the transition over realtime, so a
  // participant's browser never fires a command it isn't allowed to run.
  useEffect(() => {
    if (!plan || plan.status !== "open" || !plan.deadline || !hostToken) return;
    const ms = new Date(plan.deadline).getTime() - Date.now();
    // setTimeout(…, 0) defers even a past deadline, so we never call
    // setState synchronously in the effect body.
    const t = setTimeout(() => {
      if (stage === "pool") void advanceToFinal();
      else void decide();
    }, Math.max(0, ms));
    return () => clearTimeout(t);
  }, [plan, stage, hostToken, decide, advanceToFinal]);

  // Record the winner once when the decision arrives.
  useEffect(() => {
    if (!decided || !winnerId || revealFired.current) return;
    revealFired.current = true;
    addBeen(winnerId);
  }, [decided, winnerId]);

  function saveName(name: string) {
    localStorage.setItem(`voter:${id}`, name);
    setVoterName(name);
  }

  // ── The last mile: set time, RSVP, claim/mark booking ────────────
  async function patchPlan(fields: Partial<Plan>) {
    if (!plan) return;
    const previous = plan;
    setPlan({ ...plan, ...fields }); // optimistic
    if (!hostToken) {
      setPlan(previous);
      setNotice("Only the person who started this plan can change these details.");
      return;
    }
    try {
      const result = await runHostCommand("patch", fields);
      if (result?.plan) setPlan(result.plan);
    } catch (error) {
      setPlan(previous); // roll the optimistic update back
      setNotice(error instanceof Error ? error.message : "That didn't save. Check your connection and try again.");
    }
  }

  async function setRsvp(choice: "coming" | "maybe" | "no") {
    if (!voterName || !participantHash) return;
    const mine = rsvps.find((r) => r.voter_name === voterName);
    const nextComing = choice === "coming";
    haptic(8);
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
    haptic(8);
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
      return;
    }
    void rememberVisit();
  }

  // Rating the winner is the only moment the app knows for certain that
  // someone actually went. That is what turns a decided plan into history,
  // so it is where the visit gets written — logVisit is unique per
  // (person, plan), so re-rating updates the same visit instead of stacking.
  //
  // Signed-in visitors only: `visits` is owner-scoped to a people row, and a
  // shared link carries no account. Everyone else still rates normally; they
  // just have nowhere personal to file it.
  async function rememberVisit() {
    if (!winnerId || !plan) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    // A guest arriving straight from a share link may have no profile row yet.
    const { data: personId } = await supabase.rpc("ensure_authenticated_profile", {
      p_display_name: voterName,
    });
    if (typeof personId !== "string") return;
    const saved = await logVisit({
      person_id: personId,
      spot_id: winnerId,
      plan_id: id,
      visited_at: plan.event_time ?? undefined,
      group_label: plan.title,
      companions: rsvps
        .filter((r) => (r.choice ?? (r.coming ? "coming" : "no")) === "coming" && r.voter_name !== voterName)
        .map((r) => ({ name: r.voter_name })),
    });
    setVisitSaved(saved ? "saved" : "failed");
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      haptic(10);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      return; // clipboard blocked — leave the button unchanged
    }
  }

  // ── States ───────────────────────────────────────────────────────
  // All six full-screen non-content states render through <VoteState>. The
  // access reasons come straight from bootstrapPlanAccess; the load ones from
  // the plan/spots fetch below.
  const retryAccess = () => { setAccess("checking"); void runAccess(); };

  if (access === "captcha-required") {
    return (
      <VoteState kind="captcha">
        <Turnstile action="plan-access" onVerify={onCaptchaVerify} />
      </VoteState>
    );
  }
  if (access === "anonymous-disabled") {
    return <VoteState kind="guest-paused" />;
  }
  if (access === "sign-in-failed" || access === "claim-failed") {
    return <VoteState kind="retry" onRetry={retryAccess} />;
  }
  if (access === "not-found") {
    return <VoteState kind="cold-link" />;
  }

  // "checking" means we haven't been allowed to look yet — not that the plan is
  // absent. Only a load that actually ran can report notfound/error below.
  if (access === "checking" || load === "loading") {
    return <VoteState kind="loading" planTitle={plan?.title} />;
  }

  if (load === "notfound") {
    return <VoteState kind="cold-link" />;
  }

  if (load === "error") {
    return (
      <VoteState
        kind="retry"
        onRetry={() => { setLoad("loading"); setReloadKey((k) => k + 1); }}
      />
    );
  }

  if (!voterName) {
    return (
      <main className={"vote-experience mx-auto grid min-h-dvh max-w-md place-items-center px-5"}>
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

  // The card the room is converging on, for the After Dark sheen. A tie has
  // no leader on purpose: sheening two cards would read as "both winning",
  // which is the opposite of what a reveal is for. Zero votes has none either.
  const leaderId = (() => {
    const top = Math.max(0, ...visibleSpots.map((spot) => yesCount(spot.id)));
    if (top === 0) return null;
    const leaders = visibleSpots.filter((spot) => yesCount(spot.id) === top);
    return leaders.length === 1 ? leaders[0].id : null;
  })();
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
              Hey {voterName} · <CountUp value={voters} /> {voters === 1 ? "person" : "people"} voting
            </p>
            {(plan!.budget_per_person != null || plan!.radius_km != null) && (
              <p className="vote-plan-constraints">
                {plan!.budget_per_person != null ? `Up to AED ${plan!.budget_per_person} per person` : "Any budget"}
                {plan!.radius_km != null ? ` · within ${plan!.radius_km} km of ${plan!.origin_label ?? "the starting point"}` : ""}
              </p>
            )}
            {!decided && (
              <p className="vote-round-label">
                <span className="sr-only">
                  {stage === "pool" ? `Round ${activePool} of ${poolCount} · choose one` : "Final shortlist · choose one"}
                </span>
                <span aria-hidden="true">
                  {stage === "pool"
                    ? nightMode
                      ? `Round ${roman(activePool)} of ${roman(poolCount)} · choose one`
                      : `Round ${activePool} of ${poolCount} · choose one`
                    : "Final shortlist · choose one"}
                </span>
              </p>
            )}
            {/* Only worth showing when someone else is here — "you are here"
                is not news, and a solo row would just be permanent chrome. */}
            {presentNames.length > 1 && (
              <p className="vote-presence">
                <span className="vote-face-stack" aria-hidden="true">
                  {presentNames.slice(0, 5).map((name) => (
                    <span key={name} style={avatarStyle(name)}>{initialsOf(name)}</span>
                  ))}
                </span>
                <span>
                  {presentNames.filter((name) => name !== voterName).join(", ")}
                  {presentNames.length > 5 ? " and others" : ""} here now
                </span>
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
                onClick={() => {
                  setRoundDir(poolNumber >= activePool ? 1 : -1);
                  setActivePool(poolNumber);
                  haptic(6);
                }}
                aria-current={activePool === poolNumber ? "step" : undefined}
                data-complete={poolsChosenByMe.has(poolNumber) || undefined}
                aria-label={`Round ${poolNumber} of ${poolCount}${poolsChosenByMe.has(poolNumber) ? ", chosen" : ""}`}
              >
                <span aria-hidden="true">{nightMode ? roman(poolNumber) : poolNumber}</span>
              </button>
            ))}
          </nav>
        )}

        {/* Three places in the current round, or the three finalists. On a
            phone this is a snap carousel (see .vote-options-grid); the key
            re-mounts it per round so the next set animates in rather than
            swapping in place. */}
        <div
          key={`round-${currentPoolNumber}`}
          style={{ "--round-dir": roundDir } as React.CSSProperties}
          className="vote-options-grid vote-round mt-6 grid gap-3.5 sm:grid-cols-3"
        >
          {visibleSpots.map((spot) => (
            <div key={spot.id} ref={(el) => { cardRefs.current[spot.id] = el; }}>
              <OptionCard
                spot={spot}
                voters={votersFor(spot.id)}
                yesCount={yesCount(spot.id)}
                voted={iVotedYes(spot.id)}
                isWinner={winnerId === spot.id}
                isLeader={spot.id === leaderId}
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
              : !isHost
                ? "Your vote is in. The host will move things along once everyone’s ready."
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
              isHost={isHost}
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
