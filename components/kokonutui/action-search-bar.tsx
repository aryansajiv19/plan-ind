"use client";

/**
 * Originally @kokonutui's ActionSearchBar (MIT, kokonutui.com) — kept for its
 * input/listbox behaviour and animation, rewritten for this app.
 *
 * What changed and why: the registry version filtered a hardcoded array and
 * its "select" handler only closed the list, so the most prominent control in
 * the signed-in app matched nothing real and navigated nowhere. Typing a
 * venue name returned an empty listbox.
 *
 * Now: an empty query offers the four quick actions (which actually move you),
 * and a real query searches the curated catalogue — the same `spots` ilike
 * query StartPlanForm's "I already know where" uses, including the same age
 * gate, so a result you can't actually use is never offered. Deliberately NOT
 * /api/smart-search: that is the AI brief-to-shortlist path, quota-gated and
 * dependent on OpenAI credits, which is the wrong engine for "find the place
 * I can already name" and would make this control fail closed again.
 */

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import useDebounce from "@/hooks/use-debounce";
import { supabase } from "@/lib/supabase";
import { minimumAgeForCategory } from "@/lib/age-policy";

export type SearchTab = "plan" | "discover" | "been" | "friends" | "profile";

interface SearchItem {
  id: string;
  label: string;
  description?: string;
  end?: string;
  run: () => void;
}

interface SpotHit {
  id: string;
  name: string;
  area: string;
  category: string;
  minimum_age: number | null;
}

const MIN_QUERY = 2;

const ANIMATION_VARIANTS = {
  container: {
    hidden: { opacity: 0, height: 0 },
    show: {
      opacity: 1,
      height: "auto",
      transition: {
        height: { duration: 0.4 },
        staggerChildren: 0.1,
      },
    },
    exit: {
      opacity: 0,
      height: 0,
      transition: {
        height: { duration: 0.3 },
        opacity: { duration: 0.2 },
      },
    },
  },
  item: {
    hidden: { opacity: 0, y: 20 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.3 },
    },
    exit: {
      opacity: 0,
      y: -10,
      transition: { duration: 0.2 },
    },
  },
} as const;

function ActionSearchBar({
  age,
  onQuickAction,
  defaultOpen = false,
}: {
  /** Server-owned age, for the same gate every other catalogue path applies. */
  age: number;
  onQuickAction: (tab: SearchTab) => void;
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(defaultOpen);
  const [activeIndex, setActiveIndex] = useState(-1);
  // Results carry the query they belong to, so a stale response can be
  // recognised during render instead of cleared from an effect (which would
  // be a synchronous setState in an effect body — the React 19 lint trap
  // this repo has already hit twice).
  const [hits, setHits] = useState<{ query: string; spots: SpotHit[] } | null>(null);
  const debouncedQuery = useDebounce(query, 200);
  const trimmed = debouncedQuery.trim();
  const searching = trimmed.length >= MIN_QUERY && hits?.query !== trimmed;

  useEffect(() => {
    const q = trimmed;
    if (q.length < MIN_QUERY) return;
    let cancelled = false;
    supabase
      .from("spots")
      .select("id,name,area,category,minimum_age")
      .eq("source", "curated")
      .ilike("name", `%${q}%`)
      .order("name")
      .limit(6)
      .then(({ data }) => {
        if (cancelled) return;
        const rows = (data ?? []) as SpotHit[];
        setHits({
          query: q,
          spots: rows.filter(
            (spot) => age >= Math.max(minimumAgeForCategory(spot.category), spot.minimum_age ?? 0),
          ),
        });
      });
    return () => { cancelled = true; };
  }, [trimmed, age]);

  const quickActions: SearchItem[] = useMemo(() => [
    { id: "discover", label: "Search a place", description: "The curated catalogue", end: "Discover", run: () => onQuickAction("discover") },
    { id: "plan", label: "Start tonight's plan", description: "Pick a vibe, deal three", end: "Plan", run: () => onQuickAction("plan") },
    { id: "friends", label: "Find a friend", description: "Who you go out with", end: "Friends", run: () => onQuickAction("friends") },
    { id: "been", label: "Check where you've been", description: "Your visit log", end: "Been", run: () => onQuickAction("been") },
  ], [onQuickAction]);

  const items: SearchItem[] = useMemo(() => {
    if (trimmed.length < MIN_QUERY) return quickActions;
    const spots = hits?.query === trimmed ? hits.spots : [];
    return spots.map((spot) => ({
      id: spot.id,
      label: spot.name,
      description: spot.area,
      end: "Open",
      run: () => router.push(`/place/${spot.id}`),
    }));
  }, [trimmed, hits, quickActions, router]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(e.target.value);
      setActiveIndex(-1);
    },
    []
  );

  const runItem = useCallback((item: SearchItem) => {
    setIsFocused(false);
    setActiveIndex(-1);
    item.run();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        setIsFocused(false);
        setActiveIndex(-1);
        return;
      }
      if (!items.length) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
          break;
        case "Enter":
          e.preventDefault();
          if (activeIndex >= 0 && items[activeIndex]) runItem(items[activeIndex]);
          break;
      }
    },
    [items, activeIndex, runItem]
  );

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    setActiveIndex(-1);
  }, []);

  const handleBlur = useCallback(() => {
    setTimeout(() => {
      setIsFocused(false);
      setActiveIndex(-1);
    }, 200);
  }, []);

  // An honest empty state: a query that found nothing says so, rather than
  // rendering an empty box that looks like the search is broken.
  const noMatches = trimmed.length >= MIN_QUERY && !searching && items.length === 0;

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="relative flex flex-col items-center justify-start">
        <div className="z-10 w-full max-w-sm">
          <label
            className="mb-1 block font-medium text-muted text-xs"
            htmlFor="search"
          >
            Search
          </label>
          <div className="relative">
            <Input
              aria-activedescendant={
                activeIndex >= 0 ? `action-${items[activeIndex]?.id}` : undefined
              }
              aria-autocomplete="list"
              aria-expanded={isFocused}
              autoComplete="off"
              className="h-9 rounded-lg py-1.5 pr-9 pl-3 text-sm focus-visible:ring-offset-0"
              id="search"
              onBlur={handleBlur}
              onChange={handleInputChange}
              onFocus={handleFocus}
              onKeyDown={handleKeyDown}
              placeholder="Search a place, a night, or a person"
              role="combobox"
              type="text"
              value={query}
            />
            <div className="absolute top-1/2 right-3 -translate-y-1/2">
              <AnimatePresence mode="popLayout">
                {query.length > 0 && (
                  <motion.span
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 20, opacity: 0 }}
                    initial={{ y: -20, opacity: 0 }}
                    key="go"
                    transition={{ duration: 0.2 }}
                    className="text-xs font-bold text-muted"
                  >
                    Go
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <div className="relative w-full max-w-sm">
          <AnimatePresence>
            {isFocused && (
              <motion.div
                animate="show"
                aria-label="Search results"
                className="absolute top-1 left-0 z-20 w-full overflow-hidden rounded-md border bg-card shadow-xs"
                exit="exit"
                initial="hidden"
                role="listbox"
                variants={ANIMATION_VARIANTS.container}
              >
                <motion.ul role="none">
                  {items.map((item, index) => (
                    <motion.li
                      aria-selected={activeIndex === index}
                      className={`flex cursor-pointer items-center justify-between rounded-md px-3 py-2 hover:bg-accent ${
                        activeIndex === index ? "bg-accent" : ""
                      }`}
                      id={`action-${item.id}`}
                      key={item.id}
                      layout
                      onClick={() => runItem(item)}
                      role="option"
                      variants={ANIMATION_VARIANTS.item}
                    >
                      {/* Stacked, not side by side: this sits in an 18rem
                          nav column, where a label and its description on one
                          row wrap into each other and read as noise. */}
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate font-medium text-ink text-sm">
                          {item.label}
                        </span>
                        {item.description && (
                          <span className="truncate text-muted text-xs">
                            {item.description}
                          </span>
                        )}
                      </div>
                      {item.end && (
                        <span className="shrink-0 pl-2 text-right text-muted text-xs">
                          {item.end}
                        </span>
                      )}
                    </motion.li>
                  ))}
                </motion.ul>

                {searching && (
                  <p className="px-3 py-2 text-muted text-xs" role="status">Searching the catalogue…</p>
                )}
                {noMatches && (
                  <p className="px-3 py-2 text-muted text-xs" role="status">
                    No place in the catalogue matches that.
                  </p>
                )}

                <div className="mt-2 border-line border-t px-3 py-2">
                  <div className="flex items-center justify-between text-muted text-xs">
                    <span>↑↓ to move, Enter to select</span>
                    <span>ESC to cancel</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

export default ActionSearchBar;
