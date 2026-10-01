import type { Plan, PlanStage } from "@/lib/types";
import type { Seat } from "@/lib/tally";
import VoteSeats from "@/components/vote/VoteSeats";
import { RoundLabel } from "@/components/vote/RoundProgress";
import { useMinuteClock } from "@/hooks/use-minute-clock";
import ComingFrom from "@/components/vote/ComingFrom";
import WhenPoll from "@/components/vote/WhenPoll";
import type { ViewerOrigin } from "@/hooks/use-viewer-origin";

function closesLabel(deadline: string | null): string {
  if (!deadline) return "Open";
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return "Voting closed";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h >= 1 ? `Closes in ${h}h` : `Closes in ${m}m`;
}

// The vote page header: title, constraints, round label, the seats row and
// the deadline chip.
export default function PlanHeader({
  plan,
  decided,
  stage,
  activePool,
  poolCount,
  nightMode,
  roster,
  pickedThisRound,
  othersHere,
  viewer,
  when,
  onRemove,
  voterName,
}: {
  plan: Plan;
  decided: boolean;
  stage: PlanStage;
  activePool: number;
  poolCount: number;
  nightMode: boolean;
  roster: Seat[];
  pickedThisRound: Set<string>;
  othersHere: string[];
  viewer: ViewerOrigin;
  /** P21: the plan's time poll, and this account's seat on it. */
  when?: { planId: string; seatKey: string | null };
  /** 080: set for the host only; removes a member by seat key. */
  onRemove?: (seatKey: string) => void;
  /** Also the E2E suite's "this plan loaded as me" anchor. */
  voterName: string;
}) {
  useMinuteClock(); // re-render each minute, so the "Closes in" chip counts down
  return (
  <div className="vote-header flex items-start justify-between gap-3">
    <div>
      <h1 className="text-2xl font-semibold sm:text-3xl">{plan.title}</h1>
      <p className="mt-1 text-sm text-muted">
        Hey {voterName}
      </p>
      {(plan.budget_per_person != null || plan.radius_km != null) && (
        <p className="vote-plan-constraints">
          {plan.budget_per_person != null ? `Up to AED ${plan.budget_per_person} per person` : "Any budget"}
          {plan.radius_km != null ? ` · within ${plan.radius_km} km of ${plan.origin_label ?? "the starting point"}` : ""}
        </p>
      )}
      {/* reopened_at is set only by reopen_plan (057); a re-decide flips
          status, so this stops showing without clearing it. */}
      {plan.status === "open" && plan.reopened_at && (
        <p className="vote-reopened">This plan was reopened. Check your RSVP once a new place is picked.</p>
      )}
      {!decided && (
        <RoundLabel stage={stage === "pool" ? "pool" : "final"} activePool={activePool} poolCount={poolCount} nightMode={nightMode} />
      )}
      {/* §26.1: the group, not just the people who acted. */}
      {!decided && <ComingFrom viewer={viewer} />}
      {!decided && when && <WhenPoll planId={when.planId} seatKey={when.seatKey} roster={roster} />}
      {!decided && roster.length > 1 && (
        <VoteSeats roster={roster} picked={pickedThisRound} othersHere={othersHere} onRemove={onRemove} />
      )}
    </div>
    <span className="vote-deadline shrink-0 whitespace-nowrap px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-grape">
      {decided ? "Decided" : closesLabel(plan.deadline)}
    </span>
  </div>
  );
}
