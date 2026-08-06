"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { dealSpotsForCategory } from "@/lib/deal";
import { DUBAI_ORIGINS } from "@/lib/dubai-areas";

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

const CATEGORY_GROUPS = [
  {
    key: "food",
    label: "Food & drink",
    categories: [
      { key: "dinner", label: "Dinner", title: "Where should we eat?" },
      { key: "cafe", label: "Cafes", title: "Where for coffee?" },
      { key: "brunch", label: "Brunch", title: "Where's brunch?" },
      { key: "dessert", label: "Dessert", title: "Where for dessert?" },
      { key: "shisha", label: "Shisha", title: "Where for shisha?" },
    ],
  },
  {
    key: "night",
    label: "After dark",
    categories: [
      { key: "vibes", label: "Rooftops & lounges", title: "Where's the vibe?" },
      { key: "nightlife", label: "Nightlife", title: "Where are we going out?" },
      { key: "live_music", label: "Live music", title: "Where should we hear live music?" },
      { key: "karaoke", label: "Karaoke", title: "Where for karaoke?" },
    ],
  },
  {
    key: "water",
    label: "Sun & water",
    categories: [
      { key: "beach", label: "Beaches", title: "Which beach spot?" },
      { key: "beach_club", label: "Beach clubs", title: "Which beach club?" },
      { key: "water", label: "Water activities", title: "What should we do on the water?" },
    ],
  },
  {
    key: "active",
    label: "Move and play",
    categories: [
      { key: "sports", label: "Sports", title: "What's the sporting plan?" },
      { key: "padel", label: "Padel", title: "Where should we play padel?" },
      { key: "adventure", label: "Adventure", title: "What's the adrenaline plan?" },
      { key: "outdoors", label: "Outdoors", title: "What's the outdoor plan?" },
      { key: "games", label: "Games", title: "What are we playing?" },
    ],
  },
  {
    key: "leisure",
    label: "Culture & reset",
    categories: [
      { key: "movie", label: "Cinema", title: "What are we watching?" },
      { key: "culture", label: "Arts & culture", title: "What should we go see?" },
      { key: "wellness", label: "Wellness", title: "Where should we reset?" },
      { key: "shopping", label: "Shopping", title: "Where should we browse?" },
      { key: "family", label: "Family day", title: "What's the family plan?" },
      { key: "escape", label: "City escape", title: "Where should we escape to?" },
    ],
  },
] as const;

type Category = { key: string; label: string; title: string };
const CATEGORIES: readonly Category[] = CATEGORY_GROUPS.flatMap((group) => [
  ...group.categories,
]);
type CategoryKey = Category["key"];
type GroupKey = (typeof CATEGORY_GROUPS)[number]["key"];

interface SavedCustomPlace {
  id: string;
  name: string;
  area: string;
  category: string;
  visibility: "private" | "friends" | "community";
}

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

export default function StartPlanForm() {
  const router = useRouter();
  const [category, setCategory] = useState<CategoryKey>("dinner");
  const [title, setTitle] = useState<string>(CATEGORIES[0].title);
  const [activeGroup, setActiveGroup] = useState<GroupKey>("food");
  const [titleEdited, setTitleEdited] = useState(false);
  const [presetIdx, setPresetIdx] = useState(0);
  const [maxBudget, setMaxBudget] = useState<number | null>(null);
  const [originValue, setOriginValue] = useState("anywhere");
  const [radiusKm, setRadiusKm] = useState<number | null>(20);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customArea, setCustomArea] = useState("");
  const [customAddress, setCustomAddress] = useState("");
  const [customNote, setCustomNote] = useState("");
  const [customVisibility, setCustomVisibility] = useState<SavedCustomPlace["visibility"]>("private");
  const [savingCustom, setSavingCustom] = useState(false);
  const [savedCustom, setSavedCustom] = useState<SavedCustomPlace[]>([]);
  const [selectedCustomIds, setSelectedCustomIds] = useState<string[]>([]);
  const [smartQuery, setSmartQuery] = useState("");
  const [smartIntent, setSmartIntent] = useState<SmartIntent | null>(null);
  const [smartModel, setSmartModel] = useState<string | null>(null);
  const [smartLoading, setSmartLoading] = useState(false);
  const [smartError, setSmartError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase
        .from("spots")
        .select("id,name,area,category,visibility")
        .eq("source", "custom")
        .eq("created_by_user_id", auth.user.id)
        .order("name");
      if (!cancelled && data) setSavedCustom(data as SavedCustomPlace[]);
    })();
    return () => { cancelled = true; };
  }, []);

  // Picking a type swaps in its default prompt — unless you've written your own.
  function pickCategory(cat: Category) {
    setCategory(cat.key);
    if (!titleEdited) setTitle(cat.title);
  }

  function toggleCustomPlace(id: string) {
    setSelectedCustomIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 3) return current;
      return [...current, id];
    });
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
      const response = await fetch("/api/smart-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const result = await response.json() as { intent?: SmartIntent; model?: string; error?: string };
      if (!response.ok || !result.intent) throw new Error(result.error ?? "Smart search failed.");

      const matchedCategory = CATEGORIES.find((item) => item.key === result.intent!.category);
      const matchedGroup = CATEGORY_GROUPS.find((group) => group.categories.some((item) => item.key === result.intent!.category));
      const matchedOrigin = DUBAI_ORIGINS.find((origin) => origin.value === result.intent!.origin);
      if (matchedCategory) setCategory(matchedCategory.key);
      if (matchedGroup) setActiveGroup(matchedGroup.key);
      if (matchedOrigin) setOriginValue(matchedOrigin.value);
      setMaxBudget(result.intent.maxBudget);
      setRadiusKm(result.intent.origin === "anywhere" ? null : (result.intent.radiusKm ?? 20));
      setTitle(result.intent.title);
      setTitleEdited(true);
      setSmartIntent(result.intent);
      setSmartModel(result.model ?? null);
    } catch (smartSearchError) {
      setSmartError(smartSearchError instanceof Error ? smartSearchError.message : "Smart search failed.");
    } finally {
      setSmartLoading(false);
    }
  }

  async function saveCustomPlace() {
    const cleanName = customName.trim();
    const cleanArea = customArea.trim();
    if (!cleanName || !cleanArea) {
      setError("Add a name and area for your custom place.");
      return;
    }
    setSavingCustom(true);
    setError(null);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setError("Sign in again before saving a private place.");
      setSavingCustom(false);
      return;
    }
    const { data, error: saveError } = await supabase
      .from("spots")
      .insert({
        name: cleanName,
        category,
        area: cleanArea,
        cuisine: "Custom place",
        price_band: "$$",
        min_spend: 0,
        open_till: "Flexible",
        vibe: customNote.trim() || `Saved by ${auth.user.email?.split("@")[0] ?? "a friend"}`,
        description: customNote.trim() || null,
        booking_url: null,
        photo_url: null,
        source: "custom",
        visibility: customVisibility,
        created_by_user_id: auth.user.id,
        address: customAddress.trim() || null,
      })
      .select("id,name,area,category,visibility")
      .single();
    if (saveError || !data) {
      setError("That place couldn’t be saved. Check the database migration and try again.");
      setSavingCustom(false);
      return;
    }
    const saved = data as SavedCustomPlace;
    setSavedCustom((current) => [...current, saved].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedCustomIds((current) => [...current, saved.id].slice(0, 3));
    setCustomName("");
    setCustomArea("");
    setCustomAddress("");
    setCustomNote("");
    setCustomOpen(false);
    setSavingCustom(false);
  }

  async function start(e: React.FormEvent) {
    e.preventDefault();
    const clean = title.trim();
    if (!clean) return;
    setCreating(true);
    setError(null);

    // Deal nine into three pools. Up to three saved places can be pinned,
    // one into each pool; the remainder come from the ranked catalog.
    const needed = 9 - selectedCustomIds.length;
    const selectedOrigin = DUBAI_ORIGINS.find((origin) => origin.value === originValue) ?? DUBAI_ORIGINS[0];
    const dealt = await dealSpotsForCategory(category, needed, selectedCustomIds, {
      maxBudget,
      origin: selectedOrigin.coordinates,
      radiusKm: selectedOrigin.coordinates ? radiusKm : null,
      vibeKeywords: smartIntent?.vibeKeywords,
      avoidKeywords: smartIntent?.avoidKeywords,
    });
    if (!dealt) {
      const label = CATEGORIES.find((c) => c.key === category)?.label ?? category;
      setError(`Not enough related ${label.toLowerCase()} places match that budget and distance. Raise either limit, add a custom place, or try another type.`);
      setCreating(false);
      return;
    }
    const nine = [...selectedCustomIds, ...dealt];

    // 2. Create the plan (its uuid becomes the share link).
    const deadline = new Date(
      Date.now() + PRESETS[presetIdx].hours * 3_600_000,
    ).toISOString();
    const { data: plan, error: planErr } = await supabase
      .from("plans")
      .insert({
        title: clean,
        category,
        area: selectedOrigin.label,
        deadline,
        status: "open",
        stage: "pool",
        pool_count: 3,
        budget_per_person: maxBudget,
        origin_label: selectedOrigin.label,
        origin_latitude: selectedOrigin.coordinates?.latitude ?? null,
        origin_longitude: selectedOrigin.coordinates?.longitude ?? null,
        radius_km: selectedOrigin.coordinates ? radiusKm : null,
        smart_brief: smartIntent ? smartQuery.trim() : null,
        vibe_preferences: smartIntent?.vibeKeywords ?? [],
        avoid_preferences: smartIntent?.avoidKeywords ?? [],
        intelligence_model: smartModel,
      })
      .select("id")
      .single();
    if (planErr || !plan) {
      setError("Couldn't start the plan. Try again in a moment.");
      setCreating(false);
      return;
    }

    // Distribute pinned places across pools first, then fill each pool to 3.
    const { error: linkErr } = await supabase
      .from("plan_spots")
      .insert(nine.map((spot_id, index) => ({
        plan_id: plan.id,
        spot_id,
        pool_number: (index % 3) + 1,
        advanced: false,
      })));
    if (linkErr) {
      setError("The plan started but the spots didn't attach. Try again.");
      setCreating(false);
      return;
    }

    router.push(`/plan/${plan.id}`);
  }

  const visibleCategories = CATEGORY_GROUPS.find(
    (group) => group.key === activeGroup,
  )?.categories as readonly Category[] | undefined;

  return (
    <form onSubmit={start} className="plan-form">
      <section className="plan-smart-search" aria-labelledby="smart-search-heading">
        <div className="plan-smart-search__heading">
          <div><p id="smart-search-heading" className="plan-form__label">Describe the place in your head</p><small>Atmosphere, occasion, budget, area—write it naturally.</small></div>
        </div>
        <textarea value={smartQuery} onChange={(event) => setSmartQuery(event.target.value)} placeholder="A quiet terrace near Jumeirah for a date, dim lighting, around AED 250 each, somewhere we can actually talk." maxLength={600} />
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

      <section className="plan-custom-place" aria-labelledby="custom-place-heading">
        <div className="plan-custom-place__header">
          <div><p id="custom-place-heading" className="plan-form__label">Your own places</p><small>Pin up to three saved locations into this plan.</small></div>
          <button type="button" onClick={() => setCustomOpen((open) => !open)} aria-expanded={customOpen}>{customOpen ? "Close" : "Add a place"}</button>
        </div>

        {savedCustom.length > 0 && (
          <div className="plan-custom-place__saved">
            {savedCustom.map((place) => (
              <button key={place.id} type="button" onClick={() => toggleCustomPlace(place.id)} aria-pressed={selectedCustomIds.includes(place.id)}>
                <strong>{place.name}</strong><span>{place.area} · {place.visibility}</span>
              </button>
            ))}
          </div>
        )}

        {customOpen && (
          <div className="plan-custom-place__editor">
            <label><span>Name</span><input value={customName} onChange={(event) => setCustomName(event.target.value)} placeholder="Desert camp, friend's majlis…" maxLength={80} /></label>
            <label><span>Area</span><input value={customArea} onChange={(event) => setCustomArea(event.target.value)} placeholder="Al Khawaneej" maxLength={80} /></label>
            <label className="plan-custom-place__wide"><span>Address or map link</span><input value={customAddress} onChange={(event) => setCustomAddress(event.target.value)} placeholder="Kept private unless you share it" maxLength={300} /></label>
            <label className="plan-custom-place__wide"><span>Note</span><textarea value={customNote} onChange={(event) => setCustomNote(event.target.value)} placeholder="What should the group know?" maxLength={280} /></label>
            <fieldset className="plan-custom-place__wide"><legend>Visibility</legend><div>{(["private", "friends", "community"] as const).map((option) => <button key={option} type="button" onClick={() => setCustomVisibility(option)} aria-pressed={customVisibility === option}>{option}</button>)}</div></fieldset>
            <button type="button" className="plan-custom-place__save" onClick={saveCustomPlace} disabled={savingCustom}>{savingCustom ? "Saving…" : "Save and pin this place"}</button>
          </div>
        )}
      </section>

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
        {creating ? "Building three rounds…" : "Deal 9 places in 3 rounds"}
      </button>

      {error && (
        <p role="alert" className="plan-form__error">
          {error}
        </p>
      )}
    </form>
  );
}
