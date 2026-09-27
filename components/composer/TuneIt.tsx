"use client";

import { DUBAI_ORIGINS } from "@/lib/dubai-areas";
import { DEAL_BUDGET_OPTIONS, DEAL_RADIUS_OPTIONS_KM } from "@/lib/spots/match";
import WhenPicker from "@/components/WhenPicker";
import { PRESETS, type Composer } from "@/hooks/use-composer";

// The options the deal and its preview share (P6).
const budgetLabel = (value: number | null) => (value == null ? "Any budget" : `Up to AED ${value}`);
const radiusLabel = (value: number | null) => (value == null ? "Anywhere" : `${value} km`);

const countChip = (n: number | null) => n != null && (
  <><span className="sr-only"> · </span><span className="block font-medium">{n} {n === 1 ? "place" : "places"}</span></>
);

/** The limits, times, title and deadline: every one has a valid default. */
export default function TuneIt({ composer, demoMode }: { composer: Composer; demoMode: boolean }) {
  const { preview, need, maxBudget, setMaxBudget, originValue, setOriginValue, radiusKm, setRadiusKm, when, title, setTitle, setTitleEdited, presetIdx, setPresetIdx } = composer;
  return (
    <>
      <section className="plan-constraints" aria-labelledby="recommendation-heading">
        <div className="plan-constraints__heading">
          <p id="recommendation-heading" className="plan-form__label">Recommendation limits</p>
          <small>The nine places will stay within these limits.</small>
        </div>

        <fieldset>
          <legend>Budget per person</legend>
          <div className="plan-choice-strip plan-choice-strip--budget">
            {DEAL_BUDGET_OPTIONS.map((value) => {
              const n = preview.count(value, radiusKm);
              return (
                <button key={budgetLabel(value)} type="button" onClick={() => setMaxBudget(value)} aria-pressed={maxBudget === value} disabled={n != null && n < need} className="disabled:opacity-50">
                  {budgetLabel(value)}{countChip(n)}
                </button>
              );
            })}
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
              {DEAL_RADIUS_OPTIONS_KM.map((value) => {
                const n = originValue === "anywhere" ? null : preview.count(maxBudget, value);
                return (
                  <button key={radiusLabel(value)} type="button" onClick={() => setRadiusKm(value)} aria-pressed={radiusKm === value} disabled={n != null && n < need} className="disabled:opacity-50">
                    {radiusLabel(value)}{countChip(n)}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>
      </section>

      {!demoMode && <WhenPicker when={when} />}

      <label htmlFor="plan-title" className="plan-form__label plan-form__label--spaced">
        Give it a title
      </label>
      <input
        id="plan-title"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          setTitleEdited(true);
        }}
        maxLength={60}
        className="plan-form__input"
      />

      <p className="plan-form__label plan-form__label--spaced">Voting closes</p>
      <div className="plan-deadlines">
        {PRESETS.map((p, i) => (
          <button
            key={p.label}
            type="button"
            onClick={() => setPresetIdx(i)}
            aria-pressed={presetIdx === i}
            className="plan-deadline"
          >
            {p.label}
          </button>
        ))}
      </div>
    </>
  );
}
