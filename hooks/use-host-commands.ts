"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { getSupabase } from "@/lib/supabase";
import { secureJsonFetch } from "@/lib/security/csrf-client";
import type { Plan, PlanSpot, PlanStage, Spot } from "@/lib/types";

// ISO instant -> the value a datetime-local input expects (local wall time).
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

// B7: is the signed-in account this plan's creator? Null when the answer is
// unknown (am_plan_host is migration 067, not on every stack yet, or the
// read failed): the device's host token decides, as before 067.
async function amPlanHost(planId: string): Promise<boolean | null> {
  const { data, error } = await getSupabase().rpc("am_plan_host", { p_plan_id: planId });
  return !error && typeof data === "boolean" ? data : null;
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
  const [accountIsHost, setAccountIsHost] = useState<boolean | null>(null);
  // Whoever created the plan, on any device. The RPCs enforce this
  // server-side for every command, so this flag is UI truthfulness, not the
  // gate: a wrong guess shows controls the server refuses, nothing more.
  const isHost = accountIsHost ?? Boolean(hostToken);
  // R1: set when this tab's advance left the final round no time, so the
  // deadline effect never decides in the same tick it advanced (F7: never
  // set when the final got its own deadline, or it would block auto-decide).
  const advancedHere = useRef(false);

  useEffect(() => {
    const saved = localStorage.getItem(`plan-host:${id}`);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setHostToken(saved);
    let live = true;
    void amPlanHost(id).then((answer) => { if (live) setAccountIsHost(answer); });
    return () => { live = false; };
  }, [id]);

  const runHostCommand = useCallback(async (command: "advance" | "decide" | "patch", patch: Partial<Plan> = {}) => {
    if (!isHost) return null;
    const response = await secureJsonFetch(`/api/plans/${id}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hostToken, command, patch }),
    });
    const result = await response.json() as { plan?: Plan; finalists?: string[]; error?: string };
    if (!response.ok || !result.plan) throw new Error(result.error ?? "That plan command could not be saved.");
    return result;
  }, [hostToken, isHost, id]);

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
    if (!isHost || !plan || !editing) return;
    const body: { command: "edit"; hostToken: string | null; title?: string; deadline?: string } = { command: "edit", hostToken };
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
    if (!isHost) return;
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
    if (!isHost) return;
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
      // 069 (P15): a decided plan can be cancelled until someone rates or logs a visit.
      const result = response.status === 409 ? ((await response.json().catch(() => null)) as { result?: string } | null)?.result : undefined;
      setNotice(
        result === "already_happened" ? "Someone has already rated or been, so this plan can’t be cancelled."
          : response.status === 409 ? "This plan is already decided, so it can’t be deleted."
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
    if (!isHost) {
      setNotice("Only the person who started this plan can close the rounds.");
      return;
    }
    setDeciding(true);
    try {
      const result = await runHostCommand("advance");
      // Only a final round the server gave no time (before 067's extension).
      advancedHere.current = Boolean(result?.plan?.deadline) && Date.parse(result!.plan!.deadline!) <= Date.now();
      if (result?.finalists) setPlanSpots((current) => current.map((link) => ({ ...link, advanced: result.finalists!.includes(link.spot_id) })));
      if (result?.plan) setPlan(result.plan);
      setNotice(null);
    } catch (error) {
      await failHostCommand(error, "The shortlist didn’t save. Try again.");
    } finally {
      setDeciding(false);
    }
  }, [plan, stage, isHost, runHostCommand, failHostCommand, setNotice, setPlan, setPlanSpots]);

  const decide = useCallback(async () => {
    if (!plan || plan.status !== "open" || spots.length === 0) return;
    if (!isHost) {
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
  }, [plan, spots.length, isHost, runHostCommand, failHostCommand, setNotice, setPlan]);

  // ── Deadline: any member's device moves the plan on (P4) ─────────
  // expire_plan (069) advances or decides an expired plan for whichever
  // member is looking, idempotent and race-safe, so a closed tab on the
  // host's phone no longer freezes the group. Without 069 on a stack, the
  // host's tab does it as before. Returns false only for "not due yet".
  const expire = useCallback(async (): Promise<boolean> => {
    const { data, error } = await getSupabase().rpc("expire_plan", { p_plan_id: id });
    if (error) {
      if (error.code === "PGRST202" && isHost) {
        if (stage === "pool") await advanceToFinal();
        else await decide();
      }
      return true;
    }
    const result = data as { result?: string; plan?: Plan; finalists?: string[] } | null;
    if (result?.result === "not_due") return false;
    if (result?.finalists) setPlanSpots((current) => current.map((link) => ({ ...link, advanced: result.finalists!.includes(link.spot_id) })));
    if (result?.plan) setPlan(result.plan);
    return true;
  }, [id, isHost, stage, advanceToFinal, decide, setPlan, setPlanSpots]);

  useEffect(() => {
    if (!plan || plan.status !== "open" || !plan.deadline || deleted) return;
    const ms = new Date(plan.deadline).getTime() - Date.now();
    // R1: the final round gets its own time ('advance' extends the deadline
    // server-side). A final whose deadline is already past right after this
    // tab advanced means it got none, so leave the decision to the host.
    if (stage !== "pool" && ms <= 0 && advancedHere.current) return;
    // On load for an already-past deadline, else at the deadline. "Not due"
    // means this device's clock runs ahead of the server's: try again soon.
    // setTimeout(…, 0) keeps setState out of the effect body.
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const run = async () => {
      if (!(await expire()) && !cancelled) timer = setTimeout(run, 5_000);
    };
    timer = setTimeout(run, Math.max(0, ms));
    return () => { cancelled = true; clearTimeout(timer); };
  }, [plan, stage, deleted, expire]);

  return {
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
