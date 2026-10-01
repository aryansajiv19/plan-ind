import { answerSummary } from "@/lib/gathering";
import { avatarStyle, initialsOf } from "@/lib/avatar";
import { originFor, summariseGroup, type GroupPref } from "@/lib/group-prefs";
import { SAMPLE_FRIENDS, SAMPLE_PLAN, SAMPLE_VOTER } from "@/components/demo/sampleDecision";

// Invented taps for the sample group, rendered only under the "Sample plan"
// label. They agree with the sample plan's own limits (every origin is within
// the radius of every sample place, every cap is the plan's budget or higher),
// so the "fits" line on each card is computed, never written by hand.
const taps: readonly [string, number | null, string | null, string[], string[]][] = [
  [SAMPLE_VOTER, null, "downtown", ["chill"], []],
  [SAMPLE_FRIENDS[0], SAMPLE_PLAN.budgetPerPerson, "business-bay", ["lively"], []],
  [SAMPLE_FRIENDS[1], null, "jumeirah", ["chill", "rooftop"], []],
  [SAMPLE_FRIENDS[2], SAMPLE_PLAN.budgetPerPerson, "downtown", [], ["loud"]],
  [SAMPLE_FRIENDS[3], null, "al-quoz", ["lively"], []],
];

export const SAMPLE_GROUP: GroupPref[] = taps.map(([name, budgetCap, origin, vibes, avoid]) => ({
  name, budgetCap, origin: origin ? originFor(origin) : null, vibes, avoid,
}));

/** "How these were chosen": read-only, closed by default so the demo still opens mid-vote. */
export default function SampleGroupAnswers() {
  const cap = summariseGroup(SAMPLE_GROUP).budgetCap;
  return (
    <details className="mt-4 border border-line px-4">
      <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium">How these were chosen</summary>
      <div className="pb-4">
        <p className="text-base font-semibold">The group’s answers <span className="text-sm font-normal text-muted">(sample)</span></p>
        <ul className="mt-2 grid gap-2">
          {taps.map(([name, budget, origin, vibes, avoid]) => (
            <li key={name} className="flex items-center gap-2 text-sm">
              <span aria-hidden="true" style={avatarStyle(name)} className="grid size-7 shrink-0 place-items-center rounded-full text-xs font-medium">{initialsOf(name)}</span>
              <span><span className="font-medium">{name}</span>{" "}<span className="text-muted">{answerSummary({ budget_cap: budget, origin_value: origin, vibes, avoid })}</span></span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm">
          The deal used: {cap != null ? `under AED ${cap} for everyone, ` : ""}{SAMPLE_PLAN.radiusKm} km or less for all.
        </p>
      </div>
    </details>
  );
}
