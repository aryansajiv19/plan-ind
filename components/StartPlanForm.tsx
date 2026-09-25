"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { dealSpotsForCategory } from "@/lib/deal";
import { DUBAI_ORIGINS } from "@/lib/dubai-areas";
import { minimumAgeForCategory } from "@/lib/age-policy";
import { categoryMeta } from "@/lib/categories";
import { secureJsonFetch } from "@/lib/security/csrf-client";
import { CATEGORIES, CATEGORY_GROUPS, type Category, type GroupKey } from "@/components/categoryGroups";
import DirectPlanSearch from "@/components/DirectPlanSearch";
import CustomPlaceSection, { useCustomPlaces } from "@/components/CustomPlaces";
import DealReveal from "@/components/DealReveal";
import { SAMPLE_POOLS } from "@/components/demo/sampleDecision";
import type { PlanPrefill } from "@/lib/board-plan";

const PRESETS = [
  { label: "In 3 hours", hours: 3 },
  { label: "In 12 hours", hours: 12 },
  { label: "Tomorrow", hours: 24 },
] as const;

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

type CategoryKey = Category["key"];

interface SmartIntent {
  category: string;
  title: string;
  summary: string;
  maxBudget: number | null;
  origin: string;
  radiusKm: number | null;
  vibeKeywords: string[];
  avoidKeywords: string[];
  occasion: string | null;
}

export default function StartPlanForm({
  age = 21,
  demoMode = false,
  prefill = null,
}: {
  age?: number;
  demoMode?: boolean;
  /** "Plan from this board": initial values only. The form remounts per board. */
  prefill?: PlanPrefill | null;
}) {
  const router = useRouter();
  // SPECS.md §10.1's second entry point: "Deal three rounds" (the existing
  // flow, untouched below) vs "I already know where" (search, pick one
  // spot, hand off to DirectPlanForm — same component the place page's CTA
  // uses, so both doors converge on the same creation call). Demo-preview
  // only shows the deal flow — the direct path needs a real session either
  // way (create_direct_plan rejects signed-out/anonymous callers), same
  // reasoning as gating PlaceDirectPlanCta on a real user.
  const [mode, setMode] = useState<"deal" | "direct">("deal");
  const [category, setCategory] = useState<CategoryKey>(prefill?.category ?? "dinner");
  const [title, setTitle] = useState<string>(prefill?.title || CATEGORIES[0].title);
  const [activeGroup, setActiveGroup] = useState<GroupKey>(
    CATEGORY_GROUPS.find((group) => group.categories.some((c) => c.key === prefill?.category))?.key ?? "food",
  );
  const [titleEdited, setTitleEdited] = useState(Boolean(prefill?.title));
  const [presetIdx, setPresetIdx] = useState(0);
  const [maxBudget, setMaxBudget] = useState<number | null>(null);
  const [originValue, setOriginValue] = useState(prefill?.origin ?? "anywhere");
  const [radiusKm, setRadiusKm] = useState<number | null>(20);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const custom = useCustomPlaces(category, setError);
  // The deal reveal plays while the request runs; submit resolves this when
  // the sequence has shown, and navigates once both are done.
  const [revealing, setRevealing] = useState(false);
  const revealShown = useRef<(() => void) | null>(null);
  const [smartQuery, setSmartQuery] = useState("");
  const [smartIntent, setSmartIntent] = useState<SmartIntent | null>(null);
  const [smartLoading, setSmartLoading] = useState(false);
  const [smartError, setSmartError] = useState<string | null>(null);

  // Picking a type swaps in its default prompt — unless you've written your own.
  function pickCategory(cat: Category) {
    if (age < minimumAgeForCategory(cat.key)) return;
    setCategory(cat.key);
    if (!titleEdited) setTitle(cat.title);
  }

  async function interpretSmartSearch() {
    const query = smartQuery.trim();
    if (query.length < 8) {
      setSmartError("Describe the atmosphere, occasion or kind of place you want.");
      return;
    }
    setSmartLoading(true);
    setSmartError(null);
    try {
      const response = await secureJsonFetch("/api/smart-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const result = await response.json() as { intent?: SmartIntent; error?: string };
      if (!response.ok || !result.intent) throw new Error(result.error ?? "Smart search failed.");

      const matchedCategory = CATEGORIES.find((item) => item.key === result.intent!.category);
      const matchedGroup = CATEGORY_GROUPS.find((group) => group.categories.some((item) => item.key === result.intent!.category));
      const matchedOrigin = DUBAI_ORIGINS.find((origin) => origin.value === result.intent!.origin);
      // Same age gate pickCategory() enforces for the manual buttons — without
      // it a query that resolves to an 18+/21+ category (e.g. "nightlife")
      // could set `category` to one no button in the age-filtered list shows
      // as selected. The server re-validates age independently either way
      // (no restricted plan can actually be created), but the form shouldn't
      // silently point at a category the person can't use. Skips quietly,
      // same as clicking a category that isn't rendered for your age.
      if (matchedCategory && age >= minimumAgeForCategory(matchedCategory.key)) {
        setCategory(matchedCategory.key);
      }
      if (matchedGroup) setActiveGroup(matchedGroup.key);
      if (matchedOrigin) setOriginValue(matchedOrigin.value);
      setMaxBudget(result.intent.maxBudget);
      setRadiusKm(result.intent.origin === "anywhere" ? null : (result.intent.radiusKm ?? 20));
      setTitle(result.intent.title);
      setTitleEdited(true);
      setSmartIntent(result.intent);
    } catch (smartSearchError) {
      setSmartError(smartSearchError instanceof Error ? smartSearchError.message : "Smart search failed.");
    } finally {
      setSmartLoading(false);
    }
  }

  const selectedOrigin = DUBAI_ORIGINS.find((origin) => origin.value === originValue) ?? DUBAI_ORIGINS[0];
  const categoryLabel = CATEGORIES.find((c) => c.key === category)?.label ?? category;

  /** Deal nine, create the plan. Returns the plan id or a message to show. */
  async function dealAndCreate(clean: string): Promise<{ id: string } | { error: string }> {
    // Up to three saved places are pinned, one into each pool; the
    // remainder come from the ranked catalog.
    const pinned = custom.selectedIds;
    const dealt = await dealSpotsForCategory(category, 9 - pinned.length, pinned, {
      maxBudget,
      origin: selectedOrigin.coordinates,
      radiusKm: selectedOrigin.coordinates ? radiusKm : null,
      vibeKeywords: smartIntent?.vibeKeywords,
      avoidKeywords: smartIntent?.avoidKeywords,
      age,
    });
    if (!dealt) {
      return { error: `Not enough related ${categoryLabel.toLowerCase()} places match that budget and distance. Raise either limit, add a custom place, or try another type.` };
    }
    const response = await secureJsonFetch("/api/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: clean,
        category,
        area: selectedOrigin.label,
        deadline: new Date(Date.now() + PRESETS[presetIdx].hours * 3_600_000).toISOString(),
        budgetPerPerson: maxBudget,
        originLabel: selectedOrigin.label,
        originLatitude: selectedOrigin.coordinates?.latitude ?? null,
        originLongitude: selectedOrigin.coordinates?.longitude ?? null,
        radiusKm: selectedOrigin.coordinates ? radiusKm : null,
        smartBrief: smartIntent ? smartQuery.trim() : null,
        vibePreferences: smartIntent?.vibeKeywords ?? [],
        avoidPreferences: smartIntent?.avoidKeywords ?? [],
        spotIds: [...pinned, ...dealt],
      }),
    });
    const result = await response.json().catch(() => ({})) as { id?: string; hostToken?: string; error?: string };
    if (!response.ok || !result.id) return { error: result.error ?? "Couldn't start the plan. Try again in a moment." };
    if (result.hostToken) localStorage.setItem(`plan-host:${result.id}`, result.hostToken);
    return { id: result.id };
  }

  async function start(e: React.FormEvent) {
    e.preventDefault();
    const clean = title.trim();
    if (!clean) return;
    setError(null);
    // The preview has no session to deal with: play the reveal on sample
    // places and hand over to /demo/vote instead of a sign-in dead end.
    if (demoMode) { setRevealing(true); return; }

    const restricted = custom.restrictedFor(age);
    if (restricted) {
      setError(`${restricted.name} has an age requirement that does not match this account.`);
      return;
    }
    setCreating(true);
    setRevealing(true);
    const shown = new Promise<void>((resolve) => { revealShown.current = resolve; });
    const outcome = await dealAndCreate(clean).catch(() => ({ error: "Couldn't start the plan. Check your connection and try again." }));
    if ("error" in outcome) {
      setRevealing(false);
      setError(outcome.error);
      setCreating(false);
      return;
    }
    await shown;
    router.push(`/plan/${outcome.id}`);
  }

  // What the deal is working from, echoed back as the reveal's chips.
  const constraintChips = [
    categoryLabel,
    maxBudget != null ? `Up to AED ${maxBudget}` : "Any budget",
    selectedOrigin.coordinates
      ? (radiusKm != null ? `Within ${radiusKm} km of ${selectedOrigin.label}` : `From ${selectedOrigin.label}`)
      : "Anywhere in Dubai",
    ...(smartIntent?.vibeKeywords.slice(0, 2) ?? []),
    ...(custom.selectedIds.length > 0 ? [`${custom.selectedIds.length} of your places`] : []),
  ];

  if (revealing) {
    return (
      <DealReveal
        constraints={constraintChips}
        code={categoryMeta(category).code}
        cards={demoMode ? SAMPLE_POOLS.flat() : undefined}
        onShown={() => revealShown.current?.()}
      >
        {demoMode ? (
          <>
            <p className="plan-form__demo-note">Sample places, not a real deal. Sign in to deal nine for your own group.</p>
            <Link href="/demo/vote" className="plan-submit inline-flex items-center justify-center">See how the group votes</Link>
            <button type="button" className="mt-2 inline-flex min-h-11 w-full items-center justify-center text-sm text-muted underline underline-offset-4" onClick={() => setRevealing(false)}>
              Back to the form
            </button>
          </>
        ) : (
          <p className="plan-form__demo-note" role="status">Setting up the vote…</p>
        )}
      </DealReveal>
    );
  }

  const visibleCategories = CATEGORY_GROUPS.find(
    (group) => group.key === activeGroup,
  )?.categories.filter((item) => age >= minimumAgeForCategory(item.key)) as readonly Category[] | undefined;

  const modeToggle = !demoMode && (
    <div className="plan-mode-toggle" role="group" aria-label="How do you want to plan?">
      <button type="button" aria-pressed={mode === "deal"} onClick={() => setMode("deal")}>
        Deal three rounds
      </button>
      <button type="button" aria-pressed={mode === "direct"} onClick={() => setMode("direct")}>
        I already know where
      </button>
    </div>
  );

  if (mode === "direct") {
    return (
      <div className="plan-form">
        {modeToggle}
        <DirectPlanSearch age={age} />
      </div>
    );
  }

  return (
    // The composer takes the hue of whichever group is open, so switching
    // tabs visibly recolours the form. Each tab overrides it with its own.
    <form onSubmit={start} className="plan-form">
      {modeToggle}
      {prefill && (
        <p className="plan-form__demo-note" role="status">
          Set up from your board {prefill.boardName}, leaning the way its places do. Check the type and area, then deal nine from the catalogue.
        </p>
      )}
      <section className="plan-smart-search" aria-labelledby="smart-search-heading">
        <div className="plan-smart-search__heading">
          <div><p id="smart-search-heading" className="plan-form__label">Describe the place in your head</p><small>Atmosphere, occasion, budget, area. Write it naturally.</small></div>
        </div>
        <textarea
          id="smart-search-input"
          value={smartQuery}
          onChange={(event) => {
            setSmartQuery(event.target.value);
            setSmartIntent(null);
            setSmartError(null);
          }}
          placeholder="A quiet terrace near Jumeirah for a date, dim lighting, around AED 250 each, somewhere we can actually talk."
          maxLength={600}
          aria-describedby="smart-search-help smart-search-count"
        />
        <div className="plan-smart-search__meta">
          <small id="smart-search-help">Use a real plan, place or activity. Include an area, mood, occasion or budget if you know it.</small>
          <small id="smart-search-count" aria-live="polite">{smartQuery.length}/600</small>
        </div>
        <button type="button" onClick={interpretSmartSearch} disabled={smartLoading || smartQuery.trim().length < 8}>{smartLoading ? "Understanding your plan…" : "Build my search"}</button>
        {smartError && <p className="plan-smart-search__error" role="alert">{smartError}</p>}
        {smartIntent && (
          <div className="plan-smart-result" aria-live="polite">
            <div><strong>{smartIntent.summary}</strong></div>
            <div>{smartIntent.occasion && <span>{smartIntent.occasion}</span>}{smartIntent.vibeKeywords.map((keyword) => <span key={keyword}>{keyword}</span>)}{smartIntent.maxBudget != null && <span>≤ AED {smartIntent.maxBudget} pp</span>}</div>
          </div>
        )}
      </section>

      <fieldset>
        <legend className="plan-form__label">What kind of hangout?</legend>
        <div className="plan-category-groups" aria-label="Category groups">
          {CATEGORY_GROUPS.map((group) => (
            <button
              key={group.key}
              type="button"
              onClick={() => setActiveGroup(group.key)}
              aria-pressed={activeGroup === group.key}
              className="plan-category-group"
            >
              {group.label}
            </button>
          ))}
        </div>

        <div className="plan-category-options">
          {visibleCategories?.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => pickCategory(c)}
            aria-pressed={category === c.key}
            className="plan-category-option"
          >
            {c.label}
          </button>
          ))}
        </div>
      </fieldset>

      <CustomPlaceSection places={custom} />

      <div className="plan-round-summary" aria-label="Plan voting format">
        <span><strong>9</strong> places</span>
        <span><strong>3</strong> pools</span>
        <span><strong>3</strong> finalists</span>
        <span><strong>1</strong> plan</span>
      </div>

      <section className="plan-constraints" aria-labelledby="recommendation-heading">
        <div className="plan-constraints__heading">
          <p id="recommendation-heading" className="plan-form__label">Recommendation limits</p>
          <small>The nine places will stay within these limits.</small>
        </div>

        <fieldset>
          <legend>Budget per person</legend>
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
      </section>

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

      <button
        type="submit"
        disabled={creating || !title.trim()}
        className="plan-submit"
      >
        {creating ? "Building three rounds…" : demoMode ? "Preview the deal" : "Deal 9 places in 3 rounds"}
      </button>

      {demoMode && (
        <p className="plan-form__demo-note">
          Exploring the preview? <Link href="/login">Sign in</Link> to save, share and vote on a real plan.
        </p>
      )}

      {error && (
        <p role="alert" className="plan-form__error">
          {error}
        </p>
      )}
    </form>
  );
}
