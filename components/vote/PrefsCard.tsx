"use client";

import { useState } from "react";
import { DUBAI_ORIGINS } from "@/lib/dubai-areas";
import { GROUP_AVOID_OPTIONS, GROUP_BUDGET_OPTIONS, GROUP_VIBE_OPTIONS } from "@/lib/group-prefs";
import { budgetLabel, answerSummary, type PrefsInput } from "@/lib/gathering";
import type { PlanPreferences } from "@/lib/types";


// A chip is a real button; pressed shows as an ink fill AND a check, never colour alone.
const CHIP = "inline-flex min-h-11 items-center gap-1.5 border border-line bg-transparent px-3.5 text-sm font-medium text-ink aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-card disabled:opacity-50 rounded-[var(--radius-control)]";

function Chip({ on, onClick, disabled, children }: { on: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" className={CHIP} aria-pressed={on} onClick={onClick} disabled={disabled}>
      {on && <span aria-hidden="true">{"✓"}</span>}
      {children}
    </button>
  );
}

function Group({ legend, hint, children }: { legend: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="mb-2 p-0 text-base font-semibold">
        {legend}
        {hint && <span className="ml-2 text-sm font-normal text-muted">{hint}</span>}
      </legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

/**
 * Three optional taps. Budget and "coming from" start on Any, so saving
 * untouched is a real answer ("I'm easy") and takes one tap.
 */
export default function PrefsCard({ mine, onSave }: { mine: PlanPreferences | null; onSave: (input: PrefsInput) => Promise<string | null> }) {
  const [editing, setEditing] = useState(false);
  const [budget, setBudget] = useState<number | null>(mine?.budget_cap ?? null);
  const [origin, setOrigin] = useState<string>(mine?.origin_value ?? "anywhere");
  const [vibes, setVibes] = useState<string[]>(mine?.vibes ?? []);
  const [avoid, setAvoid] = useState<string[]>(mine?.avoid ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (mine && !editing) {
    return (
      <section className="border border-line p-4" aria-labelledby="gather-in-title">
        <h2 id="gather-in-title" className="text-lg font-semibold">You’re in</h2>
        <p className="mt-1 text-sm text-muted">{answerSummary(mine)}</p>
        <button type="button" className="mt-2 inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4" onClick={() => setEditing(true)}>
          Edit my answers
        </button>
      </section>
    );
  }

  const toggle = (list: string[], set: (next: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : list.length < 2 ? [...list, value] : list);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const failure = await onSave({ budgetCap: budget, origin: origin === "anywhere" ? null : origin, vibes, avoid });
    setSaving(false);
    if (failure) setError(failure);
    else setEditing(false);
  }

  return (
    <form onSubmit={save} className="grid gap-5 border border-line p-4" aria-labelledby="gather-prefs-title">
      <div>
        <h2 id="gather-prefs-title" className="text-lg font-semibold">What works for you?</h2>
        <p className="mt-1 text-sm text-muted">Three taps, all optional. Any is a fine answer.</p>
      </div>

      <Group legend="Budget per person">
        {GROUP_BUDGET_OPTIONS.map((cap) => <Chip key={cap ?? "any"} on={budget === cap} onClick={() => setBudget(cap)}>{budgetLabel(cap)}</Chip>)}
      </Group>

      <Group legend="Coming from">
        {DUBAI_ORIGINS.map((o) => <Chip key={o.value} on={origin === o.value} onClick={() => setOrigin(o.value)}>{o.value === "anywhere" ? "Anywhere" : o.label}</Chip>)}
      </Group>

      <Group legend="Vibe" hint="Up to 2">
        {GROUP_VIBE_OPTIONS.map((o) => (
          <Chip key={o.value} on={vibes.includes(o.value)} disabled={vibes.length >= 2 && !vibes.includes(o.value)} onClick={() => toggle(vibes, setVibes, o.value)}>{o.label}</Chip>
        ))}
      </Group>

      <details open={avoid.length > 0}>
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium underline underline-offset-4">Anything to avoid?</summary>
        <div className="mt-2">
          <Group legend="Avoid" hint="Up to 2">
            {GROUP_AVOID_OPTIONS.map((o) => (
              <Chip key={o.value} on={avoid.includes(o.value)} disabled={avoid.length >= 2 && !avoid.includes(o.value)} onClick={() => toggle(avoid, setAvoid, o.value)}>{o.label}</Chip>
            ))}
          </Group>
        </div>
      </details>

      {error && <p role="alert" className="text-sm font-medium text-punch-text">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="vote-primary-action" disabled={saving}>
          {saving ? "Saving…" : error ? "Try again" : mine ? "Update my answers" : "Save my answers"}
        </button>
        {mine && <button type="button" className="vote-secondary-action" onClick={() => { setEditing(false); setError(null); }}>Cancel</button>}
      </div>
    </form>
  );
}
