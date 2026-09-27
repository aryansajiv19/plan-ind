"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { dealSpotsForCategory, inRevealOrder } from "@/lib/deal";
import { DUBAI_ORIGINS } from "@/lib/dubai-areas";
import { DEAL_BUDGET_OPTIONS, DEAL_RADIUS_OPTIONS_KM } from "@/lib/spots/match";
import { useDealPreview } from "@/hooks/use-deal-preview";
import { minimumAgeForCategory } from "@/lib/age-policy";
import { secureJsonFetch } from "@/lib/security/csrf-client";
import { saveDraft } from "@/lib/plan-draft";
import type { SmartIntent } from "@/components/SmartSearchBox";
import { CATEGORIES, CATEGORY_GROUPS, type Category, type GroupKey } from "@/components/categoryGroups";
import { useCustomPlaces } from "@/components/CustomPlaces";
import type { RevealCard } from "@/components/DealReveal";
import { offerTimes, useWhenPicks } from "@/components/WhenPicker";
import { fetchSampleDeal } from "@/lib/deal-sample";
import type { PlanPrefill } from "@/lib/board-plan";

export const PRESETS = [
  { label: "In 3 hours", hours: 3 },
  { label: "In 12 hours", hours: 12 },
  { label: "Tomorrow", hours: 24 },
] as const;

type CategoryKey = Category["key"];
export type PinnedPlace = NonNullable<PlanPrefill["pinned"]>;

/** P25: Luna's budget or radius, snapped to the nearest chip the form offers (ties go up). */
export function nearestOption(options: readonly (number | null)[], value: number | null): number | null {
  if (value == null) return null;
  const numbers = options.filter((option): option is number => option != null);
  return numbers.reduce((best, option) => (Math.abs(option - value) <= Math.abs(best - value) ? option : best), numbers[0]);
}

// P25: the last settings a plan was dealt with, per device. Every read is
// checked against what the form offers now; anything stale is ignored.
const SETTINGS_KEY = "deal-three:composer";
type Remembered = { category?: string; maxBudget?: number | null; origin?: string; radiusKm?: number | null; presetIdx?: number };
function readRemembered(): Remembered | null {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null");
    return raw && typeof raw === "object" ? raw as Remembered : null;
  } catch {
    return null;
  }
}

/**
 * The deal composer's state and actions: what the host picks, the deal,
 * the plan it creates and the reveal in between. StartPlanForm renders it;
 * ComposerDeck and TuneIt each render their part.
 */
export function useComposer({ age, demoMode, prefill }: { age: number; demoMode: boolean; prefill: PlanPrefill | null }) {
  const router = useRouter();
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
  // Catalogue places the vote starts with (P30 prefill, P25 deck), one per round in pin order.
  const [pins, setPins] = useState<PinnedPlace[]>(prefill?.pinned ? [prefill.pinned] : []);
  // Saved places share the cap of three with catalogue pins, so none is ever dropped.
  const custom = useCustomPlaces(category, setError, pins.length);
  const pinnedIds = [...pins.map((pin) => pin.id), ...custom.selectedIds].slice(0, 3);
  // "Tune it" opens itself when an error is about a field inside it.
  const [tuneOpen, setTuneOpen] = useState(false);
  const togglePin = (place: PinnedPlace) => setPins((current) => (
    current.some((pin) => pin.id === place.id) ? current.filter((pin) => pin.id !== place.id)
      : pinnedIds.length < 3 ? [...current, place] : current
  ));
  /** The round a pinned place is dealt into (create_secure_plan: place i in round i mod 3), or null. */
  const roundOf = (id: string) => { const i = pinnedIds.indexOf(id); return i < 0 ? null : i + 1; };
  const when = useWhenPicks(); // P21
  // P6: label each limit with what it can deal from, and switch off what
  // can't fill the nine left after pinned places. Needs a session, so not in the demo.
  const preview = useDealPreview(category, originValue, !demoMode);
  const need = 9 - pinnedIds.length;
  // The deal reveal plays while the request runs; submit resolves this when
  // the sequence has shown, and navigates once both are done.
  const [revealing, setRevealing] = useState(false);
  // The nine real cards the reveal deals (P8 signed out, P26 signed in), or
  // null: face down, or the sample decks in the preview.
  const [revealCards, setRevealCards] = useState<readonly RevealCard[] | null>(null);
  const revealShown = useRef<(() => void) | null>(null);
  const [smartQuery, setSmartQuery] = useState(prefill?.smartQuery ?? "");
  const [smartIntent, setSmartIntent] = useState<SmartIntent | null>(null);

  // P25: the last settings, once, when nothing else set the form up. After
  // paint, so the server render and the first client render agree.
  const [remembered, setRemembered] = useState<Remembered | null>(null);
  useEffect(() => {
    if (prefill) return;
    const frame = requestAnimationFrame(() => {
      const saved = readRemembered();
      if (!saved) return;
      const known = CATEGORIES.find((c) => c.key === saved.category);
      if (known && age >= minimumAgeForCategory(known.key)) {
        setCategory(known.key);
        setTitle(known.title);
        setActiveGroup(CATEGORY_GROUPS.find((group) => group.categories.some((c) => c.key === known.key))?.key ?? "food");
      }
      if (saved.maxBudget === null || DEAL_BUDGET_OPTIONS.includes(saved.maxBudget as number)) setMaxBudget(saved.maxBudget ?? null);
      if (DUBAI_ORIGINS.some((origin) => origin.value === saved.origin)) setOriginValue(saved.origin!);
      if (saved.radiusKm === null || DEAL_RADIUS_OPTIONS_KM.includes(saved.radiusKm as number)) setRadiusKm(saved.radiusKm ?? null);
      if (Number.isInteger(saved.presetIdx) && saved.presetIdx! >= 0 && saved.presetIdx! < PRESETS.length) setPresetIdx(saved.presetIdx!);
      setRemembered(saved);
    });
    return () => cancelAnimationFrame(frame);
    // Once, on mount: the form remounts per prefill.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A remembered type the counts now hide (P6) gives way to the default.
  useEffect(() => {
    if (!remembered || remembered.category !== category || preview.canFill(category)) return;
    const frame = requestAnimationFrame(() => {
      setCategory("dinner");
      setTitle(CATEGORIES[0].title);
      setActiveGroup("food");
      setRemembered(null);
    });
    return () => cancelAnimationFrame(frame);
  });

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
    setMaxBudget(nearestOption(DEAL_BUDGET_OPTIONS, intent.maxBudget));
    setRadiusKm(intent.origin === "anywhere" ? null : nearestOption(DEAL_RADIUS_OPTIONS_KM, intent.radiusKm ?? 20));
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
    const pinCards = [...pins, ...custom.pinnedCards].slice(0, pinned.length);
    const all = [...pinCards, ...(dealt.cards ?? [])];
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
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ category, maxBudget, origin: originValue, radiusKm, presetIdx } satisfies Remembered));
    } catch { /* storage blocked: nothing remembered */ }
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

    if (!when.valid) { setError("Offer two to four times, or none."); setTuneOpen(true); return; }
    const restricted = custom.restrictedFor(age);
    if (restricted) {
      setError(`${restricted.name} has an age requirement that does not match this account.`);
      setTuneOpen(true);
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
    ...pins.map((pin) => `With ${pin.name}`),
    ...(custom.selectedIds.length > 0 ? [`${custom.selectedIds.length} of your places`] : []),
  ];

  // Offered: old enough for it, and (P6) able to fill nine. The picked one always shows.
  const offered = (item: Category) => item.key === category || (age >= minimumAgeForCategory(item.key) && preview.canFill(item.key));
  const groups = CATEGORY_GROUPS.filter((group) => (group.categories as readonly Category[]).some(offered));
  // A group emptied by the counts gives way to the one holding the pick.
  const shownGroup = groups.find((group) => group.key === activeGroup)
    ?? groups.find((group) => group.categories.some((c) => c.key === category));
  const visibleCategories = shownGroup?.categories.filter(offered) as readonly Category[] | undefined;

  return {
    category, pickCategory, setActiveGroup, groups, shownGroup, visibleCategories,
    title, setTitle, setTitleEdited, presetIdx, setPresetIdx,
    maxBudget, setMaxBudget, originValue, setOriginValue, radiusKm, setRadiusKm,
    creating, error, custom, pins, togglePin, roundOf, pinnedIds, when, preview, need, tuneOpen, setTuneOpen,
    revealing, setRevealing, revealCards, revealShown,
    smartQuery, setSmartQuery, smartIntent, setSmartIntent, applyIntent,
    stashDraft, signIn, start, constraintChips,
  };
}

export type Composer = ReturnType<typeof useComposer>;
