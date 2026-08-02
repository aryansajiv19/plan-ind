"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Plan, Rating, Rsvp, Spot, Vote } from "@/lib/types";
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
  const [votes, setVotes] = useState<Vote[]>([]);
  const [rsvps, setRsvps] = useState<Rsvp[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [voterName, setVoterName] = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [reloadKey, setReloadKey] = useState(0); // bump to retry the load

  const confettiRef = useRef<ConfettiHandle>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const revealFired = useRef(false);

  const decided = plan?.status === "decided";
  const winnerId = plan?.winner_spot_id ?? null;

  // ── Load plan + its three spots + existing votes ─────────────────
  const refetchVotes = useCallback(async () => {
    const { data } = await supabase.from("votes").select("*").eq("plan_id", id);
    if (data) setVotes(data as Vote[]);
  }, [id]);

  const refetchRsvps = useCallback(async () => {
    const { data } = await supabase.from("rsvps").select("*").eq("plan_id", id);
    if (data) setRsvps(data as Rsvp[]);
  }, [id]);

  const refetchRatings = useCallback(async () => {
    const { data } = await supabase.from("ratings").select("*").eq("plan_id", id);
    if (data) setRatings(data as Rating[]);
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
        .select("spot_id")
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
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, refetchVotes, refetchRsvps, refetchRatings]);

  // ── Tallies + this voter's picks ─────────────────────────────────
  const yesCount = (spotId: string) =>
    votes.filter((v) => v.spot_id === spotId && v.value).length;
  const iVotedYes = (spotId: string) =>
    votes.some(
      (v) => v.spot_id === spotId && v.voter_name === voterName && v.value,
    );

  // ── Cast / retract a yes (optimistic, then upsert) ───────────────
  async function toggleVote(spotId: string) {
    if (!voterName || decided) return;
    const next = !iVotedYes(spotId);

    const prev = votes;
    setVotes((cur) => {
      const rest = cur.filter(
        (v) => !(v.spot_id === spotId && v.voter_name === voterName),
      );
      return [
        ...rest,
        {
          id: `local-${spotId}-${voterName}`,
          plan_id: id,
          spot_id: spotId,
          voter_name: voterName,
          value: next,
        },
      ];
    });

    const { error } = await supabase.from("votes").upsert(
      { plan_id: id, spot_id: spotId, voter_name: voterName, value: next },
      { onConflict: "plan_id,spot_id,voter_name" },
    );
    if (error) {
      setVotes(prev); // roll back
      setNotice("That vote didn't save. Check your connection and tap again.");
    } else {
      setNotice(null);
    }
  }

  // ── Decide for us: random among the top-voted; settle the plan ───
  const decide = useCallback(async () => {
    if (!plan || plan.status !== "open" || spots.length === 0) return;

    // Read fresh tallies so the call is correct even from a stale client
    // (e.g. a deadline firing hours later).
    const { data: fresh } = await supabase
      .from("votes")
      .select("spot_id,value")
      .eq("plan_id", id);
    const counts = spots.map(
      (s) => (fresh ?? []).filter((v) => v.spot_id === s.id && v.value).length,
    );
    const max = Math.max(...counts);
    const leaders = spots.filter((_, i) => counts[i] === max);
    const winner = leaders[Math.floor(Math.random() * leaders.length)];

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setDeciding(true);
    const commit = async () => {
      // Guard the race: only the first "decide" wins; then read back
      // the authoritative result so everyone reveals the same spot.
      await supabase
        .from("plans")
        .update({ status: "decided", winner_spot_id: winner.id })
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
  }, [plan, spots, id]);

  // ── Deadline auto-pick ───────────────────────────────────────────
  useEffect(() => {
    if (!plan || plan.status !== "open" || !plan.deadline) return;
    const ms = new Date(plan.deadline).getTime() - Date.now();
    // setTimeout(…, 0) defers even a past deadline, so we never call
    // setState synchronously in the effect body.
    const t = setTimeout(() => decide(), Math.max(0, ms));
    return () => clearTimeout(t);
  }, [plan, decide]);

  // ── The reveal: confetti on the winner, once ─────────────────────
  useEffect(() => {
    if (!decided || !winnerId || revealFired.current) return;
    revealFired.current = true;
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
    const { error } = await supabase.from("plans").update(fields).eq("id", id);
    if (error) setNotice("That didn't save. Check your connection and try again.");
  }

  async function toggleRsvp() {
    if (!voterName) return;
    const mine = rsvps.find((r) => r.voter_name === voterName);
    const next = !(mine?.coming ?? false);
    setRsvps((cur) => [
      ...cur.filter((r) => r.voter_name !== voterName),
      { id: mine?.id ?? `local-${voterName}`, plan_id: id, voter_name: voterName, coming: next },
    ]);
    const { error } = await supabase
      .from("rsvps")
      .upsert(
        { plan_id: id, voter_name: voterName, coming: next },
        { onConflict: "plan_id,voter_name" },
      );
    if (error) {
      await refetchRsvps(); // reconcile on failure
      setNotice("Couldn't update your RSVP. Try again.");
    }
  }

  // Rate the winner after the visit. First tap fills in a sensible "again"
  // so one interaction writes a valid row; each control merges with the rest.
  async function rateWinner(partial: { stars?: number; again?: boolean }) {
    if (!voterName || !winnerId) return;
    const mine = ratings.find((r) => r.voter_name === voterName);
    const stars = partial.stars ?? mine?.stars ?? 5;
    const again = partial.again ?? mine?.again ?? stars >= 4;
    setRatings((cur) => [
      ...cur.filter((r) => r.voter_name !== voterName),
      { id: mine?.id ?? `local-${voterName}`, plan_id: id, spot_id: winnerId, voter_name: voterName, stars, again },
    ]);
    const { error } = await supabase
      .from("ratings")
      .upsert(
        { plan_id: id, spot_id: winnerId, voter_name: voterName, stars, again },
        { onConflict: "plan_id,voter_name" },
      );
    if (error) {
      await refetchRatings();
      setNotice("Couldn't save your rating. Try again.");
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  // ── States ───────────────────────────────────────────────────────
  if (load === "loading") {
    return (
      <main className="mx-auto grid min-h-dvh max-w-md place-items-center px-5">
        <p className="text-muted">Dealing three spots…</p>
      </main>
    );
  }

  if (load === "notfound") {
    return (
      <main className="mx-auto grid min-h-dvh max-w-md place-items-center px-5 text-center">
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
      <main className="mx-auto grid min-h-dvh max-w-md place-items-center px-5 text-center">
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
            className="token mt-6 rounded-2xl border-2 border-ink bg-grape px-6 py-3 font-display font-extrabold text-white"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  if (!voterName) {
    return (
      <main className="mx-auto grid min-h-dvh max-w-md place-items-center px-5">
        <NameGate planTitle={plan!.title} onSubmit={saveName} />
      </main>
    );
  }

  const voters = new Set(votes.map((v) => v.voter_name)).size;
  const winnerSpot = spots.find((s) => s.id === winnerId) ?? null;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-10">
      <div
        ref={stageRef}
        className={[
          "relative overflow-hidden rounded-[26px] border border-line bg-card p-4 sm:p-6",
          deciding ? "deck-shuffling" : "",
        ].join(" ")}
      >
        <ConfettiCanvas ref={confettiRef} />

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold sm:text-3xl">{plan!.title}</h1>
            <p className="mt-1 text-sm text-muted">
              Hey {voterName} · {voters} {voters === 1 ? "person" : "people"} voting
            </p>
          </div>
          <span className="shrink-0 whitespace-nowrap rounded-full bg-grape/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-grape">
            {decided ? "Decided" : closesLabel(plan!.deadline)}
          </span>
        </div>

        {/* The dealt hand */}
        <div className="mt-5 grid gap-3.5 sm:grid-cols-3">
          {spots.map((spot) => (
            <div key={spot.id} ref={(el) => { cardRefs.current[spot.id] = el; }}>
              <OptionCard
                spot={spot}
                yesCount={yesCount(spot.id)}
                voted={iVotedYes(spot.id)}
                isWinner={winnerId === spot.id}
                decided={decided}
                onToggle={() => toggleVote(spot.id)}
              />
            </div>
          ))}
        </div>

        {/* Controls / result */}
        {!decided ? (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={decide}
              disabled={deciding}
              className="token flex-1 rounded-2xl border-2 border-ink bg-punch px-6 py-3.5 font-display text-lg font-extrabold text-white disabled:opacity-60"
            >
              {deciding ? "Deciding…" : "Decide for us"}
            </button>
            <button
              type="button"
              onClick={copyLink}
              className="token rounded-2xl border-2 border-ink bg-card px-6 py-3.5 font-display font-extrabold"
            >
              {copied ? "Link copied ✓" : "Copy link"}
            </button>
          </div>
        ) : (
          winnerSpot && (
            <DecidedPlan
              plan={plan!}
              winner={winnerSpot}
              voterName={voterName}
              rsvps={rsvps}
              ratings={ratings}
              onSetTime={(iso) => patchPlan({ event_time: iso })}
              onToggleRsvp={toggleRsvp}
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
        No account needed. Tap the spots you’d go to — the app breaks the tie.
      </p>
    </main>
  );
}
