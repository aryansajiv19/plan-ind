"use client";

import { useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { useMinuteClock } from "@/hooks/use-minute-clock";
import { fromDubaiInput } from "@/lib/dubai-phase";
import { whenLabel, whenPicksValid, whenSuggestions } from "@/lib/when";

/** P21: the host's 2-4 offered times. State lives here so the form reads it at submit. */
export function useWhenPicks() {
  const [picks, setPicks] = useState<string[]>([]);
  const [extra, setExtra] = useState<string[]>([]); // times the host typed, offered as chips too
  const now = useMinuteClock(); // null on the server: no suggestions until the clock is known
  const toggle = (iso: string) => setPicks((current) => (
    current.includes(iso) ? current.filter((p) => p !== iso) : current.length < 4 ? [...current, iso].sort() : current
  ));
  const add = (iso: string) => {
    setExtra((current) => (current.includes(iso) ? current : [...current, iso]));
    setPicks((current) => (current.includes(iso) || current.length >= 4 ? current : [...current, iso].sort()));
  };
  const offered = now ? [...new Set([...whenSuggestions(now), ...extra])].sort() : extra;
  return { picks, offered, toggle, add, valid: now ? whenPicksValid(picks, now) : picks.length === 0 };
}

export type WhenPicks = ReturnType<typeof useWhenPicks>;

/** Offer the picks on a plan just created (set_plan_when, 073). False when they didn't save. */
export async function offerTimes(planId: string, picks: readonly string[]): Promise<boolean> {
  if (picks.length === 0) return true;
  const { data, error } = await getSupabase().rpc("set_plan_when", {
    p_plan_id: planId,
    p_host_token: localStorage.getItem(`plan-host:${planId}`),
    p_options: picks,
  });
  return !error && (data as { result?: string } | null)?.result === "set";
}

export default function WhenPicker({ when }: { when: WhenPicks }) {
  const [typed, setTyped] = useState("");
  const [typedError, setTypedError] = useState<string | null>(null);
  const hint = when.picks.length === 1 ? "Add one more time, or clear this one."
    : when.picks.length === 4 ? "Four is the most. The group ticks what works."
      : "Optional. Offer two to four times and the group ticks what works.";

  return (
    <fieldset className="mt-5">
      <legend className="plan-form__label">When? <span className="font-normal text-muted">Dubai time</span></legend>
      <p className="mt-1 text-xs text-muted" aria-live="polite">{hint}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {when.offered.map((iso) => (
          <button
            key={iso}
            type="button"
            aria-pressed={when.picks.includes(iso)}
            onClick={() => when.toggle(iso)}
            className="min-h-11 rounded-[var(--radius-control)] border border-line px-3 text-sm font-medium text-muted transition-colors duration-150 aria-pressed:border-[var(--color-punch-text)] aria-pressed:text-[var(--color-ink)] aria-pressed:bg-[color-mix(in_srgb,var(--home-metal)_10%,transparent)]"
          >
            {whenLabel(iso)}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="when-typed">Another time, Dubai time</label>
        <input
          id="when-typed"
          type="datetime-local"
          value={typed}
          onChange={(event) => { setTyped(event.target.value); setTypedError(null); }}
          className="min-h-11 rounded-[var(--radius-control)] border border-line bg-card px-3 text-sm"
        />
        <button
          type="button"
          disabled={!typed}
          onClick={() => {
            const iso = fromDubaiInput(typed);
            const at = iso ? Date.parse(iso) : NaN;
            if (!iso || at <= Date.now() || at > Date.now() + 60 * 86_400_000) {
              setTypedError("Pick a time in the next 60 days.");
              return;
            }
            when.add(iso);
            setTyped("");
          }}
          className="min-h-11 px-2 text-sm font-medium underline underline-offset-4 disabled:opacity-50"
        >
          Add this time
        </button>
      </div>
      {typedError && <p className="mt-1 text-xs" role="alert">{typedError}</p>}
    </fieldset>
  );
}
