"use client";

import Link from "next/link";
import UnavailableState from "@/components/account/UnavailableState";
import { useMinuteClock } from "@/hooks/use-minute-clock";
import type { Plan } from "@/lib/types";

export type PlanSummary = Pick<Plan, "id" | "title" | "status" | "stage" | "deadline" | "event_time" | "winner_spot_id" | "decided_at" | "stage_changed_at"> & {
  /** P31 (074): the stage moved on since this account last opened the plan. */
  changed?: boolean;
};

// Dubai time and one fixed locale, so the server and the browser render the
// same string (no hydration mismatch) and it matches the app's Dubai clock.
const when = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", weekday: "short", hour: "numeric", minute: "2-digit", hour12: true });
const at = (iso: string) => when.format(new Date(iso)).replace(":00", "").replace(" am", "am").replace(" pm", "pm");

// "5m ago", from the stage's own timestamp. Null before the clock is known.
function ago(iso: string | null | undefined, now: Date | null): string | null {
  if (!iso || !now) return null;
  const minutes = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60_000));
  if (Number.isNaN(minutes)) return null;
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / (24 * 60))}d ago`;
}

// What moved on since you last looked (P31): decided, or the final round opening.
function changeBadge(plan: PlanSummary): string {
  if (plan.status === "decided") return "Decided";
  return plan.stage === "final" ? "Final round open" : "Updated";
}

function stateLine(plan: PlanSummary, now: Date | null): string {
  if (plan.status === "decided") {
    // P11's rule: rating opens at the outing, or 3h after the decision.
    const opens = plan.event_time ?? (plan.decided_at ? new Date(Date.parse(plan.decided_at) + 3 * 3_600_000).toISOString() : null);
    if (now && opens && Date.parse(opens) <= now.getTime()) return "Rate it";
    return plan.event_time ? `Decided · ${at(plan.event_time)}` : "Decided";
  }
  const round = plan.stage === "final" ? "Final round" : "Voting";
  return plan.deadline ? `${round} · closes ${at(plan.deadline)}` : round;
}

// The signed-in Plan tab's way back into a plan (P3): before this, a plan
// could only be reopened through its share link. Empty renders nothing.
export default function YourPlans({ plans, unavailable }: { plans: PlanSummary[]; unavailable: boolean }) {
  const now = useMinuteClock();
  if (unavailable) return <section className="your-plans"><UnavailableState what="plans" /></section>;
  if (plans.length === 0) return null;
  return (
    <section className="your-plans" aria-labelledby="your-plans-title">
      <h2 id="your-plans-title" className="your-plans__title">Your plans</h2>
      <ul className="your-plans__rail">
        {plans.map((plan) => (
          <li key={plan.id}>
            <Link href={`/plan/${plan.id}`} className="your-plans__card">
              {plan.changed && (
                // Your news, so the live accent; the words carry it without colour.
                <span className="self-start rounded-full border border-[var(--color-live)] px-2 py-0.5 text-[0.7rem] font-semibold text-[var(--color-live)]">
                  {changeBadge(plan)}{ago(plan.stage_changed_at, now) ? ` · ${ago(plan.stage_changed_at, now)}` : ""}
                </span>
              )}
              <span className="your-plans__name">{plan.title}</span>
              <span className="your-plans__state">{stateLine(plan, now)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
