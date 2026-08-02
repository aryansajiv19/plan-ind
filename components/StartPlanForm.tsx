"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const PRESETS = [
  { label: "In 3 hours", hours: 3 },
  { label: "In 12 hours", hours: 12 },
  { label: "Tomorrow", hours: 24 },
] as const;

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
  const [title, setTitle] = useState("Where should we eat?");
  const [presetIdx, setPresetIdx] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    const clean = title.trim();
    if (!clean) return;
    setCreating(true);
    setError(null);

    // 1. Grab the pool and deal three.
    const { data: pool, error: poolErr } = await supabase
      .from("spots")
      .select("id");
    if (poolErr || !pool || pool.length < 3) {
      setError("Couldn't find enough spots to deal. Seed the spots table first.");
      setCreating(false);
      return;
    }
    const three = dealThree(pool).map((s) => s.id);

    // 2. Create the plan (its uuid becomes the share link).
    const deadline = new Date(
      Date.now() + PRESETS[presetIdx].hours * 3_600_000,
    ).toISOString();
    const { data: plan, error: planErr } = await supabase
      .from("plans")
      .insert({
        title: clean,
        category: "dinner",
        area: "Dubai",
        deadline,
        status: "open",
      })
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
      <label htmlFor="plan-title" className="block text-sm text-muted">
        What are you deciding?
      </label>
      <input
        id="plan-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
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
