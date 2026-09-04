"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DUBAI_ORIGINS } from "@/lib/dubai-areas";
import { secureJsonFetch } from "@/lib/security/csrf-client";
import { categoryMeta } from "@/lib/categories";

const BUDGETS = [
  { label: "Any budget", value: null },
  { label: "Up to AED 100", value: 100 },
  { label: "Up to AED 200", value: 200 },
  { label: "Up to AED 350", value: 350 },
  { label: "Up to AED 500", value: 500 },
] as const;

const RADII = [
  { label: "10 km", value: 10 },
  { label: "20 km", value: 20 },
  { label: "35 km", value: 35 },
  { label: "Anywhere", value: null },
] as const;

export interface DirectPlanSpot {
  id: string;
  name: string;
  area: string;
  category: string;
}

/**
 * SPECS.md §10.1: "skip the vote" — lock a specific, already-known place in
 * directly instead of dealing nine and voting. Both entry points (a place
 * page's CTA, /home Plan tab's "I already know where" toggle) render this
 * same component and converge on the same POST /api/plans/direct call, per
 * the spec's own "one flow out" framing.
 *
 * Deliberately no date/time or voting-deadline field: a direct plan has no
 * vote to close, and event_time is set post-creation on the payoff screen
 * either way (DecidedPlan's onSetTime) — the same as a voted-through plan.
 * Building a deadline picker with nothing for it to mean would be exactly
 * the dead-control pattern this codebase's rules warn against.
 */
export default function DirectPlanForm({ spot, onCancel }: { spot: DirectPlanSpot; onCancel?: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(`${spot.name}`);
  const [maxBudget, setMaxBudget] = useState<number | null>(null);
  const [originValue, setOriginValue] = useState("anywhere");
  const [radiusKm, setRadiusKm] = useState<number | null>(20);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cat = categoryMeta(spot.category);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = title.trim();
    if (!clean) return;
    setCreating(true);
    setError(null);
    const selectedOrigin = DUBAI_ORIGINS.find((origin) => origin.value === originValue) ?? DUBAI_ORIGINS[0];
    const response = await secureJsonFetch("/api/plans/direct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: clean,
        spotId: spot.id,
        area: spot.area,
        budgetPerPerson: maxBudget,
        originLabel: selectedOrigin.label,
        originLatitude: selectedOrigin.coordinates?.latitude ?? null,
        originLongitude: selectedOrigin.coordinates?.longitude ?? null,
        radiusKm: selectedOrigin.coordinates ? radiusKm : null,
      }),
    });
    const result = await response.json() as { id?: string; hostToken?: string; error?: string };
    if (!response.ok || !result.id) {
      setError(result.error ?? "Couldn't start the plan. Try again in a moment.");
      setCreating(false);
      return;
    }
    if (result.hostToken) localStorage.setItem(`plan-host:${result.id}`, result.hostToken);
    router.push(`/plan/${result.id}`);
  }

  return (
    <form onSubmit={submit} className="plan-form direct-plan-form">
      <div className="direct-plan-form__spot">
        <span className="direct-plan-form__spot-cat">{cat.code}</span>
        <span>
          <strong>{spot.name}</strong>
          <small>{spot.area}</small>
        </span>
      </div>

      <label htmlFor="direct-plan-title" className="plan-form__label plan-form__label--spaced">
        Give it a title
      </label>
      <input
        id="direct-plan-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={60}
        className="plan-form__input"
      />

      <fieldset>
        <legend className="plan-form__label">Budget per person</legend>
        <div className="plan-choice-strip plan-choice-strip--budget">
          {BUDGETS.map((budget) => (
            <button key={budget.label} type="button" onClick={() => setMaxBudget(budget.value)} aria-pressed={maxBudget === budget.value}>{budget.label}</button>
          ))}
        </div>
      </fieldset>

      <div className="plan-location-fields">
        <label>
          <span>Starting around</span>
          <select value={originValue} onChange={(event) => setOriginValue(event.target.value)}>
            {DUBAI_ORIGINS.map((origin) => <option key={origin.value} value={origin.value}>{origin.label}</option>)}
          </select>
        </label>
        <fieldset disabled={originValue === "anywhere"}>
          <legend>Travel radius</legend>
          <div className="plan-choice-strip">
            {RADII.map((radius) => (
              <button key={radius.label} type="button" onClick={() => setRadiusKm(radius.value)} aria-pressed={radiusKm === radius.value}>{radius.label}</button>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="direct-plan-form__actions">
        <button type="submit" disabled={creating || !title.trim()} className="plan-submit">
          {creating ? "Locking it in…" : "Plan it here"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="direct-plan-form__cancel">
            Cancel
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="plan-form__error">
          {error}
        </p>
      )}
    </form>
  );
}
