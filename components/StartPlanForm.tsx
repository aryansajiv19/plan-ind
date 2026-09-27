"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { dealSpotsForCategory, inRevealOrder } from "@/lib/deal";
import { DUBAI_ORIGINS } from "@/lib/dubai-areas";
import { DEAL_BUDGET_OPTIONS, DEAL_RADIUS_OPTIONS_KM } from "@/lib/spots/match";
import { useDealPreview } from "@/hooks/use-deal-preview";
import { minimumAgeForCategory } from "@/lib/age-policy";
import { categoryMeta } from "@/lib/categories";
import { secureJsonFetch } from "@/lib/security/csrf-client";
import { saveDraft } from "@/lib/plan-draft";
import SmartSearchBox, { type SmartIntent } from "@/components/SmartSearchBox";
import { CATEGORIES, CATEGORY_GROUPS, type Category, type GroupKey } from "@/components/categoryGroups";
import DirectPlanSearch from "@/components/DirectPlanSearch";
import CustomPlaceSection, { useCustomPlaces } from "@/components/CustomPlaces";
import DealReveal, { type RevealCard } from "@/components/DealReveal";
import WhenPicker, { offerTimes, useWhenPicks } from "@/components/WhenPicker";
import { fetchSampleDeal } from "@/lib/deal-sample";
import { SAMPLE_POOLS } from "@/components/demo/sampleDecision";
import type { PlanPrefill } from "@/lib/board-plan";

const PRESETS = [
  { label: "In 3 hours", hours: 3 },
  { label: "In 12 hours", hours: 12 },
  { label: "Tomorrow", hours: 24 },
] as const;

// The options the deal and its preview share (P6).
const budgetLabel = (value: number | null) => (value == null ? "Any budget" : `Up to AED ${value}`);
const radiusLabel = (value: number | null) => (value == null ? "Anywhere" : `${value} km`);

type CategoryKey = Category["key"];


export default function StartPlanForm({
  age = 21,
  demoMode = false,
  prefill = null,
  smartSearchAvailable = false,
}: {
  age?: number;
  demoMode?: boolean;
  /** The server has a model key; without one the box is hidden (P7). */
  smartSearchAvailable?: boolean;
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
  const [maxBudget, setMaxBudget] = useState<number | null>(prefill?.maxBudget ?? null);
  const [originValue, setOriginValue] = useState(prefill?.origin ?? "anywhere");
  const [radiusKm, setRadiusKm] = useState<number | null>(prefill?.radiusKm !== undefined ? prefill.radiusKm : 20);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const custom = useCustomPlaces(category, setError);
  // P30: "Start a vote with this place" puts that place in round 1.
  const [placePin, setPlacePin] = useState(prefill?.pinned ?? null);
  // ponytail: one pin per round, so a fourth pin (place + three saved) drops the last saved one.
  const pinnedIds = [...(placePin ? [placePin.id] : []), ...custom.selectedIds].slice(0, 3);
  const when = useWhenPicks(); // P21
  // P6: label each limit with what it can deal from, and switch off what
  // can't fill the nine left after pinned places. Needs a session, so not in the demo.
  const preview = useDealPreview(category, originValue, !demoMode);
  const need = 9 - pinnedIds.length;
  const countChip = (n: number | null) => n != null && (
    <><span className="sr-only"> · </span><span className="block font-medium">{n} {n === 1 ? "place" : "places"}</span></>
  );
  // The deal reveal plays while the request runs; submit resolves this when
  // the sequence has shown, and navigates once both are done.
  const [revealing, setRevealing] = useState(false);
  // The nine real cards the reveal deals (P8 signed out, P26 signed in), or
  // null: face down, or the sample decks in the preview.
  const [revealCards, setRevealCards] = useState<readonly RevealCard[] | null>(null);
  const revealShown = useRef<(() => void) | null>(null);
  const [smartQuery, setSmartQuery] = useState(prefill?.smartQuery ?? "");
  const [smartIntent, setSmartIntent] = useState<SmartIntent | null>(null);

  // Picking a type swaps in its default prompt — unless you've written your own.
  function pickCategory(cat: Category) {
    if (age < minimumAgeForCategory(cat.key)) return;
    setCategory(cat.key);
    if (!titleEdited) setTitle(cat.title);
  }

  function applyIntent(intent: SmartIntent) {
    const matchedCategory = CATEGORIES.find((item) => item.key === intent.category);
    const matchedGroup = CATEGORY_GROUPS.find((group) => group.categories.some((item) => item.key === intent.category));
    const matchedOrigin = DUBAI_ORIGINS.find((origin) => origin.value === intent.origin);
    if (matchedCategory && age >= minimumAgeForCategory(matchedCategory.key)) setCategory(matchedCategory.key);
    if (matchedGroup) setActiveGroup(matchedGroup.key);
    if (matchedOrigin) setOriginValue(matchedOrigin.value);
    setMaxBudget(intent.maxBudget);
    setRadiusKm(intent.origin === "anywhere" ? null : (intent.radiusKm ?? 20));
    setTitle(intent.title);
    setTitleEdited(true);
    setSmartIntent(intent);
  }

  // P7: signing in keeps what the visitor has set up; /home restores it.
  const stashDraft = () => saveDraft({ category, maxBudget, origin: originValue, radiusKm, title, smartQuery });
  function signIn() {
    stashDraft();
    router.push("/login?next=/home");
  }

  const selectedOrigin = DUBAI_ORIGINS.find((origin) => origin.value === originValue) ?? DUBAI_ORIGINS[0];
  const categoryLabel = CATEGORIES.find((c) => c.key === category)?.label ?? category;

  /** Deal the nine: pinned places first, one into each round, then the ranked catalogue. */
  async function deal(): Promise<{ spotIds: string[]; cards: RevealCard[] | null } | { error: string }> {
    const pinned = pinnedIds;
    const dealt = await dealSpotsForCategory(category, 9 - pinned.length, pinned, {
      maxBudget,
      origin: selectedOrigin.coordinates,
      radiusKm: selectedOrigin.coordinates ? radiusKm : null,
      vibeKeywords: smartIntent?.vibeKeywords,
      avoidKeywords: smartIntent?.avoidKeywords,
      age,
    });
    if (dealt && "error" in dealt) return dealt;
    if (!dealt) {
      return { error: `Not enough related ${categoryLabel.toLowerCase()} places match that budget and distance. Raise either limit, add a custom place, or try another type.` };
    }
    // P26: the real cards when the route sent them and every pin is known; else face down.
    const pins = [...(placePin ? [placePin] : []), ...custom.pinnedCards].slice(0, pinned.length);
    const all = [...pins, ...(dealt.cards ?? [])];
    const complete = dealt.cards != null && all.every(Boolean) && all.length === 9;
    return { spotIds: [...pinned, ...dealt.ids], cards: complete ? inRevealOrder(all as RevealCard[]) : null };
  }

  /** Create the plan from a deal. Returns the plan id or a message to show. */
  async function createPlan(clean: string, spotIds: string[]): Promise<{ id: string } | { error: string }> {
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
        spotIds,
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
    // Signed out (P8): deal nine real places for these settings without a
    // session, then hand over to /demo/vote instead of a sign-in dead end.
    if (demoMode) {
      setCreating(true);
      setRevealCards(await fetchSampleDeal({
        category, origin: originValue, maxBudget, radiusKm: selectedOrigin.coordinates ? radiusKm : null,
      }));
      setCreating(false);
      setRevealing(true);
      return;
    }

    if (!when.valid) { setError("Offer two to four times, or none."); return; }
    const restricted = custom.restrictedFor(age);
    if (restricted) {
      setError(`${restricted.name} has an age requirement that does not match this account.`);
      return;
    }
    setCreating(true);
    // P26: deal first, so a thin pool or a refusal is said on the form, with
    // no reveal that then bounces back. The plan is created during the reveal.
    const failed = { error: "Couldn't start the plan. Check your connection and try again." };
    const dealt = await deal().catch(() => failed);
    if ("error" in dealt) {
      setError(dealt.error);
      setCreating(false);
      return;
    }
    setRevealCards(dealt.cards);
    setRevealing(true);
    const shown = new Promise<void>((resolve) => { revealShown.current = resolve; });
    const outcome = await createPlan(clean, dealt.spotIds).catch(() => failed);
    if ("error" in outcome) {
      setRevealing(false);
      setError(outcome.error);
      setCreating(false);
      return;
    }
    // The time poll rides along the reveal too; if it doesn't save, the plan
    // page says so rather than showing no poll as if none was offered.
    const timesSaved = await offerTimes(outcome.id, when.picks).catch(() => false);
    await shown;
    router.push(`/plan/${outcome.id}${timesSaved ? "" : "?when=unsaved"}`);
  }

  // What the deal is working from, echoed back as the reveal's chips.
  const constraintChips = [
    categoryLabel,
    maxBudget != null ? `Up to AED ${maxBudget}` : "Any budget",
    selectedOrigin.coordinates
      ? (radiusKm != null ? `Within ${radiusKm} km of ${selectedOrigin.label}` : `From ${selectedOrigin.label}`)
      : "Anywhere in Dubai",
    ...(smartIntent?.vibeKeywords.slice(0, 2) ?? []),
    ...(placePin ? [`With ${placePin.name}`] : []),
    ...(custom.selectedIds.length > 0 ? [`${custom.selectedIds.length} of your places`] : []),
  ];

  if (revealing) {
    return (
      <DealReveal
        constraints={constraintChips}
        code={categoryMeta(category).code}
        cards={revealCards ?? (demoMode ? SAMPLE_POOLS.flat() : undefined)}
        onShown={() => revealShown.current?.()}
      >
        {demoMode ? (
          <>
            <p className="plan-form__demo-note">
              {revealCards
                ? "Real places that fit your settings. Sign in to deal them for your own group."
                : "Sample places shown. Sign in to deal nine for your own group."}
            </p>
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

  // Offered: old enough for it, and (P6) able to fill nine. The picked one always shows.
  const offered = (item: Category) => item.key === category || (age >= minimumAgeForCategory(item.key) && preview.canFill(item.key));
  const groups = CATEGORY_GROUPS.filter((group) => (group.categories as readonly Category[]).some(offered));
  // A group emptied by the counts gives way to the one holding the pick.
  const shownGroup = groups.find((group) => group.key === activeGroup)
    ?? groups.find((group) => group.categories.some((c) => c.key === category));
  const visibleCategories = shownGroup?.categories.filter(offered) as readonly Category[] | undefined;

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
      {/* A pinned place explains itself in its own line below. */}
      {prefill && prefill.source !== "place" && (
        <p className="plan-form__demo-note" role="status">
          {prefill.source === "friend" ? `Set up for a plan with ${prefill.boardName}. Share the link with them once it’s dealt.`
            : prefill.source === "like" ? `Set up like ${prefill.boardName}: the same type and area.`
              : prefill.boardName
                ? `Set up from your board ${prefill.boardName}, leaning the way its places do. Check the type and area, then deal nine from the catalogue.`
                : "Picked up where you left off before signing in. Check it, then deal nine."}
        </p>
      )}
      {smartSearchAvailable && (
        <SmartSearchBox
          query={smartQuery}
          onQueryChange={(query) => { setSmartQuery(query); setSmartIntent(null); }}
          intent={smartIntent}
          onIntent={applyIntent}
          demoMode={demoMode}
          onSignIn={signIn}
        />
      )}

      <fieldset>
        <legend className="plan-form__label">What kind of hangout?</legend>
        <div className="plan-category-groups" aria-label="Category groups">
          {groups.map((group) => (
            <button
              key={group.key}
              type="button"
              onClick={() => setActiveGroup(group.key)}
              aria-pressed={shownGroup?.key === group.key}
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

      {placePin && (
        <p className="mt-4 flex flex-wrap items-center gap-x-3 text-sm">
          <span><strong>{placePin.name}</strong> is in round 1; the other eight are dealt around it.</span>
          <button type="button" className="min-h-11 text-muted underline underline-offset-4" onClick={() => setPlacePin(null)}>Remove</button>
        </p>
      )}

      <CustomPlaceSection places={custom} onSignIn={demoMode ? signIn : undefined} />

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

      <button
        type="submit"
        disabled={creating || !title.trim()}
        className="plan-submit"
      >
        {creating ? (demoMode ? "Dealing…" : "Building three rounds…") : demoMode ? "Preview the deal" : "Deal 9 places in 3 rounds"}
      </button>

      {demoMode && (
        <p className="plan-form__demo-note">
          Exploring the preview? <Link href="/login?next=/home" onClick={stashDraft}>Sign in</Link> to save, share and vote on a real plan.
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
