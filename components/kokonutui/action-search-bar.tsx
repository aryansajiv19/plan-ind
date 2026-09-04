"use client";

/**
 * @author: @kokonutui
 * @description: A modern search bar component with action buttons and suggestions
 * @version: 1.0.0
 * @date: 2025-06-26
 * @license: MIT
 * @website: https://kokonutui.com
 * @github: https://github.com/kokonut-labs/kokonutui
 */

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import useDebounce from "@/hooks/use-debounce";

interface Action {
 id: string;
 label: string;
 description?: string;
 short?: string;
 end?: string;
}

interface SearchResult {
 actions: Action[];
}

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

const allActionsSample = [
  {
 id: "1",
 label: "Search a place",
 description: "The curated catalogue",
 end: "Discover",
  },
  {
 id: "2",
 label: "Start tonight's plan",
 description: "Pick a vibe, deal three",
 end: "Plan",
  },
  {
 id: "3",
 label: "Find a friend",
 description: "By name",
 end: "Friends",
  },
  {
 id: "4",
 label: "Check where you've been",
 description: "Your visit log",
 end: "Been",
  },
];

function ActionSearchBar({
 actions = allActionsSample,
 defaultOpen = false,
}: {
 actions?: Action[];
 defaultOpen?: boolean;
}) {
 const [query, setQuery] = useState("");
 const [isFocused, setIsFocused] = useState(defaultOpen);
 const [selectedAction, setSelectedAction] = useState<Action | null>(null);
 const [activeIndex, setActiveIndex] = useState(-1);
 const debouncedQuery = useDebounce(query, 200);

 const filteredActions = useMemo(() => {
 if (!debouncedQuery) return actions;

 const normalizedQuery = debouncedQuery.toLowerCase().trim();
 return actions.filter((action) => {
 const searchableText =
        `${action.label} ${action.description || ""}`.toLowerCase();
 return searchableText.includes(normalizedQuery);
    });
  }, [debouncedQuery, actions]);

  // Derived, not synced. This was a useEffect writing setResult/setActiveIndex
  // on every change of filteredActions — cascading renders for a value that is
  // a pure function of the two things above it.
 const result: SearchResult | null = useMemo(
    () => (isFocused ? { actions: filteredActions } : null),
    [isFocused, filteredActions],
  );

 // activeIndex resets wherever the list can change: typing (below) and the
 // focus handlers. That is the same guarantee the old effect gave, without
 // a render pass to do it.
 const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
 setQuery(e.target.value);
 setActiveIndex(-1);
    },
 []
  );

 const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
 if (!result?.actions.length) return;

 switch (e.key) {
 case "ArrowDown":
 e.preventDefault();
 setActiveIndex((prev) =>
 prev < result.actions.length - 1 ? prev + 1 : 0
          );
 break;
 case "ArrowUp":
 e.preventDefault();
 setActiveIndex((prev) =>
 prev > 0 ? prev - 1 : result.actions.length - 1
          );
 break;
 case "Enter":
 e.preventDefault();
 if (activeIndex >= 0 && result.actions[activeIndex]) {
 setSelectedAction(result.actions[activeIndex]);
          }
 break;
 case "Escape":
 setIsFocused(false);
 setActiveIndex(-1);
 break;
      }
    },
 [result, activeIndex]
  );

 const handleActionClick = useCallback((action: Action) => {
 setSelectedAction(action);
  }, []);

 const handleFocus = useCallback(() => {
 setSelectedAction(null);
 setIsFocused(true);
 setActiveIndex(-1);
  }, []);

 const handleBlur = useCallback(() => {
 setTimeout(() => {
 setIsFocused(false);
 setActiveIndex(-1);
    }, 200);
  }, []);

 return (
    <div className="mx-auto w-full max-w-xl">
      <div className="relative flex min-h-[300px] flex-col items-center justify-start">
        <div className="sticky top-0 z-10 w-full max-w-sm bg-background pt-4 pb-1">
          <label
 className="mb-1 block font-medium text-muted text-xs"
 htmlFor="search"
          >
            Search
          </label>
          <div className="relative">
            <Input
 aria-activedescendant={
 activeIndex >= 0
                  ? `action-${result?.actions[activeIndex]?.id}`
                  : undefined
              }
 aria-autocomplete="list"
 aria-expanded={isFocused && !!result}
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

        <div className="w-full max-w-sm">
          <AnimatePresence>
            {isFocused && result && !selectedAction && (
              <motion.div
 animate="show"
 aria-label="Search results"
 className="mt-1 w-full overflow-hidden rounded-md border bg-card shadow-xs"
 exit="exit"
 initial="hidden"
 role="listbox"
 variants={ANIMATION_VARIANTS.container}
              >
                <motion.ul role="none">
                  {result.actions.map((action) => (
                    <motion.li
 aria-selected={
 activeIndex === result.actions.indexOf(action)
                      }
 className={`flex cursor-pointer items-center justify-between rounded-md px-3 py-2 hover:bg-accent ${
 activeIndex === result.actions.indexOf(action)
                          ? "bg-accent"
                          : ""
                      }`}
 id={`action-${action.id}`}
 key={action.id}
 layout
 onClick={() => handleActionClick(action)}
 role="option"
 variants={ANIMATION_VARIANTS.item}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-ink text-sm">
                            {action.label}
                          </span>
                          {action.description && (
                            <span className="text-muted text-xs">
                              {action.description}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {action.short && (
                          <span
 aria-label={`Keyboard shortcut: ${action.short}`}
 className="text-muted text-xs"
                          >
                            {action.short}
                          </span>
                        )}
                        {action.end && (
                          <span className="text-right text-muted text-xs">
                            {action.end}
                          </span>
                        )}
                      </div>
                    </motion.li>
                  ))}
                </motion.ul>
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
