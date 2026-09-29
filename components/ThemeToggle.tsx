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
      <span aria-hidden="true">{ground === "day" ? "☾" : "☀"}</span>
    </button>
  );
}
