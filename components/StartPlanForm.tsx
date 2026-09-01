"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { dealSpotsForCategory } from "@/lib/deal";
import { DUBAI_ORIGINS } from "@/lib/dubai-areas";
import { minimumAgeForCategory, prohibitedVenueReason } from "@/lib/age-policy";
import { secureJsonFetch } from "@/lib/security/csrf-client";
import { CATEGORIES, CATEGORY_GROUPS, type Category, type GroupKey } from "@/components/categoryGroups";

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

export default function StartPlanForm({ age = 21, demoMode = false }: { age?: number; demoMode?: boolean }) {
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
  const [smartLoading, setSmartLoading] = useState(false);
  const [smartError, setSmartError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase
        .from("spots")
        .select("id,name,area,category,visibility,minimum_age")
        .eq("source", "custom")
        .eq("created_by_user_id", auth.user.id)
        .order("name");
      if (!cancelled && data) setSavedCustom(data as SavedCustomPlace[]);
    })();
    return () => { cancelled = true; };
  }, []);

  // Picking a type swaps in its default prompt — unless you've written your own.
  function pickCategory(cat: Category) {
    if (age < minimumAgeForCategory(cat.key)) return;
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

  async function saveCustomPlace() {
    const cleanName = customName.trim();
    const cleanArea = customArea.trim();
    if (!cleanName || !cleanArea) {
      setError("Add a name and area for your custom place.");
      return;
    }
    if (prohibitedVenueReason(cleanName, customNote, customAddress)) {
      setError("That place is outside Deal three's mainstream social venue policy.");
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
        minimum_age: minimumAgeForCategory(category),
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
    if (demoMode) {
      setError("This is the preview. Sign in to create and share a real plan.");
      return;
    }
    setCreating(true);
    setError(null);

    const restrictedCustom = savedCustom.find((place) =>
      selectedCustomIds.includes(place.id)
      && age < Math.max(minimumAgeForCategory(place.category), Number((place as SavedCustomPlace & { minimum_age?: number }).minimum_age ?? 0)),
    );
    if (restrictedCustom) {
      setError(`${restrictedCustom.name} has an age requirement that does not match this account.`);
      setCreating(false);
      return;
    }

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
      age,
    });
    if (!dealt) {
      const label = CATEGORIES.find((c) => c.key === category)?.label ?? category;
      setError(`Not enough related ${label.toLowerCase()} places match that budget and distance. Raise either limit, add a custom place, or try another type.`);
      setCreating(false);
      return;
    }
    const nine = [...selectedCustomIds, ...dealt];

    const deadline = new Date(
      Date.now() + PRESETS[presetIdx].hours * 3_600_000,
    ).toISOString();
    const response = await secureJsonFetch("/api/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: clean,
        category,
        area: selectedOrigin.label,
        deadline,
        budgetPerPerson: maxBudget,
        originLabel: selectedOrigin.label,
        originLatitude: selectedOrigin.coordinates?.latitude ?? null,
        originLongitude: selectedOrigin.coordinates?.longitude ?? null,
        radiusKm: selectedOrigin.coordinates ? radiusKm : null,
        smartBrief: smartIntent ? smartQuery.trim() : null,
        vibePreferences: smartIntent?.vibeKeywords ?? [],
        avoidPreferences: smartIntent?.avoidKeywords ?? [],
        spotIds: nine,
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

  const visibleCategories = CATEGORY_GROUPS.find(
    (group) => group.key === activeGroup,
  )?.categories.filter((item) => age >= minimumAgeForCategory(item.key)) as readonly Category[] | undefined;

  return (
    // The composer takes the hue of whichever group is open, so switching
    // tabs visibly recolours the form. Each tab overrides it with its own.
    <form onSubmit={start} className="plan-form" data-group={activeGroup}>
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
              data-group={group.key}
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
        {creating ? "Building three rounds…" : demoMode ? "Sign in to create a plan" : "Deal 9 places in 3 rounds"}
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
