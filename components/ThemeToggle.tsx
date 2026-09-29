"use client";

import { useSyncExternalStore } from "react";
import { THEME_COOKIE, type Ground } from "@/lib/dubai-phase";

// Day ↔ night. The choice is a cookie (a year), so the server paints the
// chosen ground on the next load with no flash; ThemeSync keeps it.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
const current = () => (document.documentElement.dataset.theme === "day" ? "day" : "night") as Ground;

export default function ThemeToggle() {
  const ground = useSyncExternalStore(subscribe, current, () => null);
  if (!ground) return null;
  const next: Ground = ground === "day" ? "night" : "day";
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      onClick={() => {
        document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
        document.documentElement.dataset.theme = next;
      }}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        {ground === "day" ? (
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
        ) : (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        )}
      </svg>
    </button>
  );
}
