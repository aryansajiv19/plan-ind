"use client";

import { useState } from "react";
import { DUBAI_ORIGINS } from "@/lib/dubai-areas";
import { GROUP_BUDGET_OPTIONS } from "@/lib/group-prefs";
import { DEAL_RADIUS_OPTIONS_KM } from "@/lib/spots/match";
import { secureJsonFetch } from "@/lib/security/csrf-client";
import type { PlanPreferences } from "@/lib/types";

// Same pressed chip as PrefsCard: ink fill plus a check, never colour alone.
const CHIP = "inline-flex min-h-11 items-center gap-1.5 border border-line bg-transparent px-3.5 text-sm font-medium text-ink aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-card rounded-[var(--radius-control)]";

/**
 * The host's two ways to deal. "Deal for the group" needs two answers to have
 * something to reconcile; below that, or on request, the host deals on their
 * own settings (the old behaviour). The server is the gate for both: a second
 * deal is a 409 it answers, and a thin pool is a 422 it explains.
 */
export default function GatheringHost({ planId, answered, mine, onDealt }: {
  planId: string;
  answered: number;
  mine: PlanPreferences | null;
  /** Reload the plan: the stage has moved on. */
  onDealt: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [budget, setBudget] = useState<number | null>(mine?.budget_cap ?? null);
  const [origin, setOrigin] = useState(mine?.origin_value ?? "anywhere");
  const [radius, setRadius] = useState<number | null>(20);
  const [dealing, setDealing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasOrigin = origin !== "anywhere";

  async function deal(own: boolean) {
    setDealing(true);
    setError(null);
    try {
      const response = await secureJsonFetch(`/api/plans/${planId}/deal`, {
        method: "POST",
        body: JSON.stringify(own ? { skip: true, budgetCap: budget, origin, radiusKm: hasOrigin ? radius : null } : {}),
      });
      // 409 means it was already dealt (another tap, another tab): the plan has moved on, so reload it.
      if (response.ok || response.status === 409) { onDealt(); return; }
      setError(((await response.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't deal the places. Try again.");
    } catch {
      setError("Couldn't deal the places. Check your connection and try again.");
    }
    setDealing(false);
  }

  const group = answered >= 2;
  return (
    <section className="grid gap-3 border-t border-line pt-4" aria-labelledby="gather-deal-title" aria-busy={dealing}>
      <h2 id="gather-deal-title" className="text-lg font-semibold">Ready when you are</h2>
      {group ? (
        <button type="button" className="vote-primary-action" disabled={dealing} onClick={() => void deal(false)}>
          {dealing && !open ? "Dealing…" : "Deal for the group"}
        </button>
      ) : (
        <p className="text-sm text-muted">Deal for the group opens when two people have answered.</p>
      )}
      <button type="button" className={group ? "inline-flex min-h-11 items-center justify-self-start text-sm font-medium underline underline-offset-4" : "vote-secondary-action"} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {group ? "Skip, use my settings" : "Deal anyway with my settings"}
      </button>

      {open && (
        <div className="grid gap-4 border border-line p-4">
          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className="mb-2 p-0 text-base font-semibold">Budget per person</legend>
            <div className="flex flex-wrap gap-2">
              {GROUP_BUDGET_OPTIONS.map((cap) => (
                <button key={cap ?? "any"} type="button" className={CHIP} aria-pressed={budget === cap} onClick={() => setBudget(cap)}>
                  {budget === cap && <span aria-hidden="true">{"✓"}</span>}{cap == null ? "Any" : `Up to AED ${cap}`}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="grid gap-1 text-base font-semibold">
            Starting around
            <select value={origin} onChange={(event) => setOrigin(event.target.value)} className="min-h-11 border border-line bg-card px-2 text-sm font-normal text-ink">
              {DUBAI_ORIGINS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          {hasOrigin && (
            <fieldset className="m-0 min-w-0 border-0 p-0">
              <legend className="mb-2 p-0 text-base font-semibold">Travel radius</legend>
              <div className="flex flex-wrap gap-2">
                {DEAL_RADIUS_OPTIONS_KM.map((km) => (
                  <button key={km ?? "any"} type="button" className={CHIP} aria-pressed={radius === km} onClick={() => setRadius(km)}>
                    {radius === km && <span aria-hidden="true">{"✓"}</span>}{km == null ? "Anywhere" : `${km} km`}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          <button type="button" className="vote-primary-action justify-self-start" disabled={dealing} onClick={() => void deal(true)}>
            {dealing ? "Dealing…" : "Deal with my settings"}
          </button>
        </div>
      )}
      {error && <p role="alert" className="text-sm font-medium text-punch-text">{error}</p>}
    </section>
  );
}
