"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase, claimPlanAccess, type PlanAccessDenial } from "@/lib/supabase";
import { participantTokenHash } from "@/lib/participant";
import type { Plan, PlanSpot, Rating, Rsvp, Spot, Vote } from "@/lib/types";

export type Load = "loading" | "ready" | "notfound" | "error";
// "checking" = access not resolved yet; "ready" = membership claimed; any
// PlanAccessDenial = a specific reason claimPlanAccess handed back.
export type Access = "checking" | "ready" | PlanAccessDenial;

// The vote page's data layer: access bootstrap, the first load, and the
// sequence-guarded refetches that Realtime (use-plan-realtime.ts) calls.
export function usePlanData(id: string) {
  const [load, setLoad] = useState<Load>("loading");
  const [access, setAccess] = useState<Access>("checking");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [planSpots, setPlanSpots] = useState<PlanSpot[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [rsvps, setRsvps] = useState<Rsvp[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [reloadKey, setReloadKey] = useState(0); // bump to retry the load
  const [participantHash, setParticipantHash] = useState<string | null>(null);

  // Redeeming the share id lives in claimPlanAccess (lib/supabase.ts) so it
  // returns a typed reason rather than throwing — each reason gets its own
  // screen (components/vote/PlanStates.tsx).
  const runAccess = useCallback(async () => {
    const result = await claimPlanAccess(id);
    setAccess(result.ok ? "ready" : result.reason);
  }, [id]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void runAccess());
    return () => window.cancelAnimationFrame(frame);
  }, [runAccess]);

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

  // Reports whether the read actually succeeded. A refetch that fails keeps
  // the last good tally, which is right — a dropped poll should not wipe a
  // working screen. But the FIRST read is different: votes starts as [], so a
  // failure there is indistinguishable from a plan nobody has voted on, and
  // the screen renders as a perfectly healthy live vote at zero. Measured: with
  // this read blocked, a plan with nine voters showed "0 people voting", every
  // option at 0 yes, no leader, and no error anywhere — fully usable, entirely
  // wrong, and nothing would make anyone retry.
  const refetchVotes = useCallback(async () => {
    const seq = ++fetchSeq.current.votes;
    const { data, error } = await getSupabase().from("votes").select("id,plan_id,spot_id,voter_name,value,phase,pool_number,participant_token_hash,created_at").eq("plan_id", id);
    if (error) return false;
    if (data && seq === fetchSeq.current.votes) setVotes(data as Vote[]);
    return true;
  }, [id]);

  useEffect(() => {
    if (access !== "ready") return;
    let active = true;
    void participantTokenHash(id).then((hash) => { if (active) setParticipantHash(hash); });
    return () => { active = false; };
  }, [access, id]);

  const refetchRsvps = useCallback(async () => {
    const seq = ++fetchSeq.current.rsvps;
    const { data, error } = await getSupabase().from("rsvps").select("id,plan_id,voter_name,coming,choice,participant_token_hash,transport,seats_available,created_at").eq("plan_id", id);
    if (error) return false;
    if (data && seq === fetchSeq.current.rsvps) setRsvps(data as Rsvp[]);
    return true;
  }, [id]);

  const refetchRatings = useCallback(async () => {
    const seq = ++fetchSeq.current.ratings;
    const { data, error } = await getSupabase().from("ratings").select("id,plan_id,spot_id,voter_name,stars,again,participant_token_hash,created_at").eq("plan_id", id);
    if (error) return false;
    if (data && seq === fetchSeq.current.ratings) setRatings(data as Rating[]);
    return true;
  }, [id]);

  const refetchPlanSpots = useCallback(async () => {
    const seq = ++fetchSeq.current.planSpots;
    const { data } = await getSupabase().from("plan_spots").select("*").eq("plan_id", id);
    if (data && seq === fetchSeq.current.planSpots) setPlanSpots(data as PlanSpot[]);
  }, [id]);

  useEffect(() => {
    // Post-020 `plans` is membership-scoped: reading before claim_plan_access
    // has redeemed the share id returns an empty set, which is indistinguishable
    // from a deleted plan. Wait for access, like every other effect here.
    if (access !== "ready") return;
    let active = true;
    (async () => {
      const { data: planRow, error: planErr } = await getSupabase()
        .from("plans")
        .select("id,title,category,area,deadline,status,stage,pool_count,budget_per_person,origin_label,origin_latitude,origin_longitude,radius_km,smart_brief,vibe_preferences,avoid_preferences,intelligence_model,winner_spot_id,event_time,booking_owner,booked,created_at,reopened_at")
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

      const { data: links, error: linksErr } = await getSupabase()
        .from("plan_spots")
        .select("*")
        .eq("plan_id", id);
      const spotIds = (links ?? []).map((l) => l.spot_id);

      // Narrowed from select("*"): OptionCard/DecidedPlan only ever read
      // these fields from a vote-page spot (traced 2026-09-04, production-
      // readiness pass). minimum_age/visibility/created_by_user_id/source/
      // address are dropped -- created_by_user_id in particular has no
      // reason reaching every shared-link voter. Note this narrows what the
      // row actually HAS at runtime; the `Spot` type below still claims the
      // full shape, so don't start reading a dropped field here without
      // adding it back to this list.
      const { data: spotRows, error: spotsErr } = spotIds.length
        ? await getSupabase().from("spots").select("id, name, category, cuisine, price_band, area, description, vibe, open_till, min_spend, latitude, longitude, photo_url, photo_attribution, booking_url, source").in("id", spotIds)
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
      // The tally is load-critical, on the same reasoning as the spots above:
      // a vote screen that cannot read the votes is not a working vote screen,
      // and showing it at zero invites someone to vote blind on what they
      // think is an empty plan. Retry is the honest offer.
      const votesOk = await refetchVotes();
      if (!active) return;
      if (!votesOk) {
        setLoad("error");
        return;
      }
      // Load-critical too, for the same reason as votes: a refused read here
      // renders "No one's committed yet" and an empty carpool list — a
      // plausible, confidently wrong decided screen. Only the FIRST read is
      // gated; later realtime refetches keep their last-good rows.
      const [rsvpsOk, ratingsOk] = await Promise.all([refetchRsvps(), refetchRatings()]);
      if (!active) return;
      if (!rsvpsOk || !ratingsOk) {
        setLoad("error");
        return;
      }
      setLoad("ready");
    })();
    return () => {
      active = false;
    };
  }, [access, id, refetchVotes, refetchRsvps, refetchRatings, reloadKey]);

  return {
    load,
    setLoad,
    setReloadKey,
    access,
    setAccess,
    runAccess,
    plan,
    setPlan,
    spots,
    planSpots,
    setPlanSpots,
    votes,
    setVotes,
    rsvps,
    setRsvps,
    ratings,
    setRatings,
    participantHash,
    refetchVotes,
    refetchRsvps,
    refetchRatings,
    refetchPlanSpots,
  };
}
