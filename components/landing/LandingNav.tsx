"use client";

import Link from "next/link";
import { APP_VIEWS, VIEW_LABELS } from "@/lib/home-views";
import { dubaiMinuteOfDay } from "@/lib/dubai-phase";
import { useMinuteClock } from "@/hooks/use-minute-clock";

// "Dubai · 7:42 pm", on the Dubai clock whatever the visitor's own zone.
function dubaiClock(now: Date): string {
  const minutes = dubaiMinuteOfDay(now);
  const hour = Math.floor(minutes / 60);
  return `${hour % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${hour < 12 ? "am" : "pm"}`;
}

// The signed-out nav: the app's own tabs, each opening its /demo view
// (fixtures, no account), then Sign in and the page's one primary action.
// Same classes as the signed-in nav, so the same breakpoints apply,
// including the bottom tab bar below 520px.
export default function LandingNav() {
  const now = useMinuteClock(); // null during SSR, so the clock never mismatches
  return (
    <header className="home-nav">
      <Link href="/" className="home-logo" aria-label="Deal three home">
        <span>D/</span>
        <span className="home-logo__three">03</span>
      </Link>

      <nav className="home-app-tabs" aria-label="Explore the app with sample data">
        {APP_VIEWS.map((view) => (
          <Link key={view} href={`/demo?view=${view}`} className="home-app-tab">
            {VIEW_LABELS[view]}
          </Link>
        ))}
      </nav>

      <div className="home-nav__right">
        {now && <span className="home-nav__clock">Dubai · {dubaiClock(now)}</span>}
        <Link href="/login" className="home-nav__login">Sign in</Link>
        <a href="#plan-lab" className="home-nav__signin">Start a plan</a>
      </div>
    </header>
  );
}
