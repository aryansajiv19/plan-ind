"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { getSupabase } from "@/lib/supabase";
import { logVisit } from "@/lib/social";
import { haptic } from "@/lib/interaction";
import type { Plan, Rating, Rsvp } from "@/lib/types";
import type { HostCommands } from "@/hooks/use-host-commands";

// A decided plan's follow-through: event time and booking (host patches),
// RSVP and carpool, rating the winner and filing the visit under Been.
export function useLastMile({
  id,
  plan,
  setPlan,
  hostToken,
  runHostCommand,
  voterName,
  participantHash,
  winnerId,
  rsvps,
  setRsvps,
  ratings,
  setRatings,
  refetchRsvps,
  refetchRatings,
  setNotice,
  reportParticipantFailure,
}: {
  id: string;
  plan: Plan | null;
  setPlan: Dispatch<SetStateAction<Plan | null>>;
  hostToken: string | null;
  runHostCommand: HostCommands["runHostCommand"];
  voterName: string | null;
  participantHash: string | null;
  winnerId: string | null;
  rsvps: Rsvp[];
  setRsvps: Dispatch<SetStateAction<Rsvp[]>>;
  ratings: Rating[];
  setRatings: Dispatch<SetStateAction<Rating[]>>;
  refetchRsvps: () => Promise<boolean>;
  refetchRatings: () => Promise<boolean>;
  setNotice: Dispatch<SetStateAction<string | null>>;
  reportParticipantFailure: (error: { code?: string; message?: string } | null, fallback: string) => void;
}) {
  const [visitSaved, setVisitSaved] = useState<"saved" | "failed" | null>(null);

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
    const { error } = await getSupabase().rpc("set_plan_rsvp", {
      p_plan_id: id,
      p_voter_name: voterName,
      p_coming: nextComing,
      p_choice: choice,
      p_participant_token_hash: participantHash,
      p_transport: mine?.transport ?? null,
      p_seats_available: mine?.seats_available ?? null,
    });
    if (error) {
      await refetchRsvps(); // reconcile on failure
      reportParticipantFailure(error, "Couldn't update your RSVP. Try again.");
    }
  }

  // Carpool (035). Rides on your existing RSVP: the RPC rewrites the whole
  // row, so the current choice is resent and a cleared option writes null.
  async function setCarpool(transport: Rsvp["transport"], seats: number | null) {
    if (!voterName || !participantHash) return;
    const mine = rsvps.find((r) => r.voter_name === voterName);
    if (!mine) return;
    const choice = mine.choice ?? (mine.coming ? "coming" : "no");
    const nextSeats = transport === "driving" ? seats : null;
    haptic(8);
    setRsvps((cur) => cur.map((r) => (r.voter_name === voterName ? { ...r, transport, seats_available: nextSeats } : r)));
    const { error } = await getSupabase().rpc("set_plan_rsvp", {
      p_plan_id: id,
      p_voter_name: voterName,
      p_coming: mine.coming,
      p_choice: choice,
      p_participant_token_hash: participantHash,
      p_transport: transport ?? null,
      p_seats_available: nextSeats,
    });
    if (error) {
      await refetchRsvps();
      setNotice("Couldn't update how you're getting there. Try again.");
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
    const { error } = await getSupabase().rpc("rate_plan", {
      p_plan_id: id,
      p_spot_id: winnerId,
      p_voter_name: voterName,
      p_stars: stars,
      p_again: again,
      p_participant_token_hash: participantHash,
    });
    if (error) {
      await refetchRatings();
      reportParticipantFailure(error, "Couldn't save your rating. Try again.");
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
    const { data: { user } } = await getSupabase().auth.getUser();
    if (!user) return;
    // A guest arriving straight from a share link may have no profile row yet.
    const { data: personId } = await getSupabase().rpc("ensure_authenticated_profile", {
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

  return { visitSaved, patchPlan, setRsvp, setCarpool, rateWinner };
}
