"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getBeen } from "@/lib/device";

const PRESETS = [
  { label: "In 3 hours", hours: 3 },
  { label: "In 12 hours", hours: 12 },
  { label: "Tomorrow", hours: 24 },
] as const;

// The hangout types you can plan. Each carries a default title so the
// prompt reads right the moment you pick it.
const CATEGORIES = [
  { key: "dinner", label: "Dinner", title: "Where should we eat?" },
  { key: "cafe", label: "Cafe", title: "Where for coffee?" },
  { key: "brunch", label: "Brunch", title: "Where's brunch?" },
  { key: "dessert", label: "Dessert", title: "Where for dessert?" },
  { key: "shisha", label: "Shisha", title: "Where for shisha?" },
  { key: "vibes", label: "Vibes", title: "Where's the vibe?" },
  { key: "beach", label: "Beach", title: "Which beach spot?" },
  { key: "outdoors", label: "Outdoors", title: "What's the outdoor plan?" },
  { key: "movie", label: "Movie", title: "What are we watching?" },
  { key: "games", label: "Games", title: "What are we playing?" },
  { key: "sports", label: "Sports", title: "Where to watch the match?" },
  { key: "karaoke", label: "Karaoke", title: "Where for karaoke?" },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]["key"];

// Deal exactly three random spots from the curated pool. The whole point:
// nobody researches — the app hands you the options.
function dealThree<T>(pool: T[]): T[] {
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, 3);
}

export default function StartPlanForm() {
  const router = useRouter();
  const [category, setCategory] = useState<CategoryKey>("dinner");
  const [title, setTitle] = useState<string>(CATEGORIES[0].title);
  const [titleEdited, setTitleEdited] = useState(false);
  const [presetIdx, setPresetIdx] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Picking a type swaps in its default prompt — unless you've written your own.
  function pickCategory(cat: (typeof CATEGORIES)[number]) {
    setCategory(cat.key);
    if (!titleEdited) setTitle(cat.title);
  }

  async function start(e: React.FormEvent) {
    e.preventDefault();
    const clean = title.trim();
    if (!clean) return;
    setCreating(true);
    setError(null);

    // 1. Grab the pool for this category and deal three.
    const { data: pool, error: poolErr } = await supabase
      .from("spots")
      .select("id")
      .eq("category", category);
    if (poolErr) {
      setError("Couldn't reach the spots. Check your connection and try again.");
      setCreating(false);
      return;
    }
    if (!pool || pool.length < 3) {
      const label = CATEGORIES.find((c) => c.key === category)?.label ?? category;
      setError(`Not enough ${label.toLowerCase()} spots yet — try another type.`);
      setCreating(false);
      return;
    }
    // Prefer spots you haven't been dealt yet (on-device memory), then rank by
    // how past groups rated them, then take three with a little variety.
    const been = new Set(getBeen());
    let eligible = pool.filter((s) => !been.has(s.id));
    if (eligible.length < 3) eligible = pool; // never block on "been"

    const ids = eligible.map((s) => s.id);
    const { data: rs } = await supabase
      .from("ratings")
      .select("spot_id,stars,again")
      .in("spot_id", ids);
    const agg = new Map<string, { n: number; stars: number; again: number }>();
    ((rs ?? []) as { spot_id: string; stars: number; again: boolean }[]).forEach(
      (r) => {
        const e = agg.get(r.spot_id) ?? { n: 0, stars: 0, again: 0 };
        e.n += 1;
        e.stars += r.stars;
        e.again += r.again ? 1 : 0;
        agg.set(r.spot_id, e);
      },
    );
    // Unrated spots score 3.6 — above a mediocre rating, so fresh places surface.
    const score = (id: string) => {
      const e = agg.get(id);
      return e && e.n > 0 ? e.stars / e.n + e.again / e.n : 3.6;
    };
    const ranked = [...eligible].sort((a, b) => score(b.id) - score(a.id));
    const shortlist = ranked.slice(0, Math.min(6, Math.max(3, ranked.length)));
    const three = dealThree(shortlist).map((s) => s.id);

    // 2. Create the plan (its uuid becomes the share link).
    const deadline = new Date(
      Date.now() + PRESETS[presetIdx].hours * 3_600_000,
    ).toISOString();
    const { data: plan, error: planErr } = await supabase
      .from("plans")
      .insert({ title: clean, category, area: "Dubai", deadline, status: "open" })
      .select("id")
      .single();
    if (planErr || !plan) {
      setError("Couldn't start the plan. Try again in a moment.");
      setCreating(false);
      return;
    }

    // 3. Deal the three spots into it.
    const { error: linkErr } = await supabase
      .from("plan_spots")
      .insert(three.map((spot_id) => ({ plan_id: plan.id, spot_id })));
    if (linkErr) {
      setError("The plan started but the spots didn't attach. Try again.");
      setCreating(false);
      return;
    }

    router.push(`/plan/${plan.id}`);
  }

  return (
    <form onSubmit={start} className="mx-auto w-full max-w-sm text-left">
      <p className="text-sm text-muted">What kind of hangout?</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => pickCategory(c)}
            aria-pressed={category === c.key}
            className={[
              "rounded-full border-2 px-4 py-2 text-sm font-bold transition",
              category === c.key
                ? "border-ink bg-grape text-white"
                : "border-ink/15 text-ink",
            ].join(" ")}
          >
            {c.label}
          </button>
        ))}
      </div>

      <label htmlFor="plan-title" className="mt-5 block text-sm text-muted">
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
        className="mt-2 w-full rounded-2xl border-2 border-ink bg-card px-4 py-3 text-lg font-medium outline-none"
      />

      <p className="mt-4 text-sm text-muted">Voting closes</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {PRESETS.map((p, i) => (
          <button
            key={p.label}
            type="button"
            onClick={() => setPresetIdx(i)}
            aria-pressed={presetIdx === i}
            className={[
              "rounded-full border-2 px-4 py-2 text-sm font-bold transition",
              presetIdx === i
                ? "border-ink bg-grape text-white"
                : "border-ink/15 text-ink",
            ].join(" ")}
          >
            {p.label}
          </button>
        ))}
      </div>

      <button
        type="submit"
        disabled={creating || !title.trim()}
        className="token mt-6 w-full rounded-2xl border-2 border-ink bg-grape px-6 py-4 font-display text-lg font-extrabold text-white disabled:opacity-40"
      >
        {creating ? "Dealing three spots…" : "Deal three spots"}
      </button>

      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-punch">
          {error}
        </p>
      )}
    </form>
  );
}
