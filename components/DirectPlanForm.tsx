"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DUBAI_ORIGINS } from "@/lib/dubai-areas";
import { secureJsonFetch } from "@/lib/security/csrf-client";
import { categoryMeta } from "@/lib/categories";

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
  const [originValue, setOriginValue] = useState("anywhere");
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
    // P12: a dropped connection used to leave "Locking it in…" spinning.
    try {
      const response = await secureJsonFetch("/api/plans/direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: clean,
          spotId: spot.id,
          area: spot.area,
          originLabel: selectedOrigin.label,
          originLatitude: selectedOrigin.coordinates?.latitude ?? null,
          originLongitude: selectedOrigin.coordinates?.longitude ?? null,
        }),
      });
      const result = await response.json().catch(() => ({})) as { id?: string; hostToken?: string; error?: string };
      if (!response.ok || !result.id) throw new Error(result.error ?? "Couldn't start the plan. Try again in a moment.");
      if (result.hostToken) localStorage.setItem(`plan-host:${result.id}`, result.hostToken);
      router.push(`/plan/${result.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error && submitError.message !== "Failed to fetch"
        ? submitError.message
        : "Couldn't reach the server. Check your connection and try again.");
      setCreating(false);
    }
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

      {/* P12: no budget or radius here. The place is already chosen, so they
          filtered nothing and could contradict it in the plan header. The
          starting point stays: the plan's travel estimate reads it. */}
      <div className="plan-location-fields">
        <label>
          <span>Starting around</span>
          <select value={originValue} onChange={(event) => setOriginValue(event.target.value)}>
            {DUBAI_ORIGINS.map((origin) => <option key={origin.value} value={origin.value}>{origin.label}</option>)}
          </select>
        </label>
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
