"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { getSupabase } from "@/lib/supabase";
import { secureJsonFetch } from "@/lib/security/csrf-client";
import type { Plan, PlanSpot, PlanStage, Spot } from "@/lib/types";

// ISO instant -> the value a datetime-local input expects (local wall time).
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

// Everything only the plan's creator can do: advance, decide, edit, delete,
// reopen, and the deadline auto-pick. Patching the last-mile fields goes
// through runHostCommand too (see use-last-mile.ts).
export function useHostCommands({
  id,
  plan,
  setPlan,
  setPlanSpots,
  stage,
  spots,
  deleted,
  setDeleted,
  setNotice,
}: {
  id: string;
  plan: Plan | null;
  setPlan: Dispatch<SetStateAction<Plan | null>>;
  setPlanSpots: Dispatch<SetStateAction<PlanSpot[]>>;
  stage: PlanStage;
  spots: Spot[];
  deleted: "self" | "remote" | null;
  setDeleted: Dispatch<SetStateAction<"self" | "remote" | null>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
}) {
  const [deciding, setDeciding] = useState(false);
  const [confirmReopen, setConfirmReopen] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // C5: host edits the title/closing time before anyone has voted.
  const [editing, setEditing] = useState<{ title: string; deadline: string } | null>(null);
  const [editPending, setEditPending] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [hostToken, setHostToken] = useState<string | null>(null);
  // Whoever created the plan, and only them — execute_plan_command enforces
  // this server-side for every command (advance/decide/patch), so this flag
  // is UI truthfulness, not the actual gate. See advanceToFinal/decide/patchPlan.
  const isHost = Boolean(hostToken);

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

  // A host command refused with 403 can mean the plan was deleted mid-flight
  // (a decide racing a delete). Telling the person who just deleted it "you
  // are not authorised" would be a lie, so look before saying anything.
  // An empty read is ambiguous (RLS-hidden vs gone), but either way this
  // plan is no longer reachable from here.
  const planIsGone = useCallback(async () => {
    const { data, error } = await getSupabase().from("plans").select("id").eq("id", id).maybeSingle();
    return !error && !data;
  }, [id]);
  const failHostCommand = useCallback(async (error: unknown, fallback: string) => {
    if (await planIsGone()) { setDeleted((d) => d ?? "remote"); return; }
    setNotice(error instanceof Error ? error.message : fallback);
  }, [planIsGone, setDeleted, setNotice]);

  // edit_plan (055) answers with a `result`, not a `plan`, so this does NOT go
  // through runHostCommand -- which throws when `plan` is missing and would
  // report a successful edit as a failure. `nothing_to_change` is a success.
  async function saveEdit() {
    if (!hostToken || !plan || !editing) return;
    const body: { command: "edit"; hostToken: string; title?: string; deadline?: string } = { command: "edit", hostToken };
    const title = editing.title.trim();
    if (title !== plan.title) body.title = title;
    if (editing.deadline && editing.deadline !== toLocalInput(plan.deadline)) {
      const at = new Date(editing.deadline);
      if (Number.isNaN(at.getTime())) { setEditError("Pick a valid closing time."); return; }
      body.deadline = at.toISOString(); // a full instant with offset, as the route requires
    }
    if (body.title === undefined && body.deadline === undefined) { setEditing(null); return; }
    setEditPending(true);
    setEditError(null);
    try {
      const response = await secureJsonFetch(`/api/plans/${id}/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({})) as { result?: string; title?: string; deadline?: string | null };
      if (payload.result === "edited" || payload.result === "nothing_to_change") {
        if (payload.result === "edited") {
          setPlan((current) => current && {
            ...current,
            title: payload.title ?? current.title,
            deadline: payload.deadline === undefined ? current.deadline : payload.deadline,
          });
        }
        setEditing(null);
        return;
      }
      if (response.status === 404) { if (await planIsGone()) { setDeleted((d) => d ?? "remote"); return; } }
      setEditError(
        payload.result === "voting_started" ? "Voting has started, so this plan can’t be edited."
          : payload.result === "invalid_title" ? "Give the plan a title."
            : payload.result === "invalid_deadline" ? "Pick a closing time in the future, within a year."
              : response.status === 403 ? "Only the person who started this plan can edit it."
                : response.status === 429 ? "Too many plan changes. Try again in a minute."
                  : "That didn’t save. Try again.",
      );
    } catch {
      setEditError("That didn’t save. Check your connection and try again.");
    } finally {
      setEditPending(false);
    }
  }

  // C7 (migration 057): the host takes a decided plan back to its final round.
  // Like edit, reopen answers { result } with no `plan`, so it doesn't go
  // through runHostCommand. The deadline is omitted: it clears, and the host
  // decides by hand.
  async function reopenPlan() {
    if (!hostToken) return;
    setReopening(true);
    try {
      const response = await secureJsonFetch(`/api/plans/${id}/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "reopen", hostToken }),
      });
      const payload = await response.json().catch(() => ({})) as { result?: string; deadline?: string | null };
      if (payload.result === "reopened") {
        setPlan((current) => current && { ...current, status: "open", stage: "final", winner_spot_id: null, deadline: payload.deadline ?? null, reopened_at: new Date().toISOString() });
        setNotice(null);
        return;
      }
      if (response.status === 404 && await planIsGone()) { setDeleted((d) => d ?? "remote"); return; }
      setNotice(
        payload.result === "booked" ? "Unmark “booked” before reopening — the booking is still marked as made."
          : payload.result === "already_happened" ? "Someone has already rated this place or logged the visit, so this plan can’t be reopened."
            : payload.result === "no_rounds" ? "This plan has no final shortlist to go back to, so it can’t be reopened."
              : payload.result === "not_decided" ? "This plan is already open."
                : response.status === 403 ? "Only the person who started this plan can reopen it."
                  : response.status === 429 ? "Too many plan changes. Try again in a minute."
                    : "That plan couldn’t be reopened. Try again.",
      );
    } catch {
      setNotice("That plan couldn’t be reopened. Check your connection and try again.");
    } finally {
      setReopening(false);
      setConfirmReopen(false);
    }
  }

  async function deletePlan() {
    if (!hostToken) return;
    setDeciding(true);
    try {
      const response = await secureJsonFetch(`/api/plans/${id}/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostToken, command: "delete" }),
      });
      // 404: already gone, which is the outcome asked for.
      if (response.ok || response.status === 404) { setDeleted("self"); return; }
      setConfirmDelete(false);
      setNotice(
        response.status === 409 ? "This plan is already decided, so it can’t be deleted."
          : response.status === 403 ? "Only the person who started this plan can delete it."
            : response.status === 429 ? "Too many plan changes. Try again in a minute."
              : "That plan couldn’t be deleted. Try again.",
      );
    } catch {
      setNotice("That plan couldn’t be deleted. Check your connection and try again.");
    } finally {
      setDeciding(false);
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
      await failHostCommand(error, "The shortlist didn’t save. Try again.");
    } finally {
      setDeciding(false);
    }
  }, [plan, stage, hostToken, runHostCommand, failHostCommand, setNotice, setPlan, setPlanSpots]);

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
      await failHostCommand(error, "The plan couldn’t be decided. Try again.");
    } finally {
      setDeciding(false);
    }
  }, [plan, spots.length, hostToken, runHostCommand, failHostCommand, setNotice, setPlan]);

  // ── Deadline auto-pick ───────────────────────────────────────────
  // Host only. Everyone else receives the transition over realtime, so a
  // participant's browser never fires a command it isn't allowed to run.
  useEffect(() => {
    if (!plan || plan.status !== "open" || !plan.deadline || !hostToken || deleted) return;
    const ms = new Date(plan.deadline).getTime() - Date.now();
    // setTimeout(…, 0) defers even a past deadline, so we never call
    // setState synchronously in the effect body.
    const t = setTimeout(() => {
      if (stage === "pool") void advanceToFinal();
      else void decide();
    }, Math.max(0, ms));
    return () => clearTimeout(t);
  }, [plan, stage, hostToken, deleted, decide, advanceToFinal]);

  return {
    hostToken,
    isHost,
    runHostCommand,
    deciding,
    confirmDelete,
    setConfirmDelete,
    confirmReopen,
    setConfirmReopen,
    reopening,
    editing,
    setEditing,
    editPending,
    editError,
    setEditError,
    saveEdit,
    reopenPlan,
    deletePlan,
    advanceToFinal,
    decide,
  };
}

export type HostCommands = ReturnType<typeof useHostCommands>;
