"use client";

import Link from "next/link";
import { TAB_VIEWS, VIEW_LABELS } from "@/lib/home-views";
import { dubaiMinuteOfDay } from "@/lib/dubai-phase";
import { useMinuteClock } from "@/hooks/use-minute-clock";
import ThemeToggle from "@/components/ThemeToggle";

// "Dubai · 7:42 pm", on the Dubai clock whatever the visitor's own zone.
function dubaiClock(now: Date): string {
  const minutes = dubaiMinuteOfDay(now);
  const hour = Math.floor(minutes / 60);
  return `${hour % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${hour < 12 ? "am" : "pm"}`;
}

// The shared top nav for every page outside /home's own. Signed out, the
// app's tabs open their /demo view (fixtures, no account); signed in, they
// open the real tab on /home. Same classes as the /home nav, so the same
// breakpoints apply, including the bottom tab bar below 520px.
export default function LandingNav({ signedIn = false }: { signedIn?: boolean }) {
  const now = useMinuteClock(); // null during SSR, so the clock never mismatches
  return (
    <header className="home-nav">
      <Link href="/" className="home-logo" aria-label="Deal three home">
        <span>D/</span>
        <span className="home-logo__three">03</span>
      </Link>

      <nav className="home-app-tabs" aria-label={signedIn ? "App" : "Explore the app with sample data"}>
        {TAB_VIEWS.map((view) => (
          <Link key={view} href={signedIn ? `/home?view=${view}` : `/demo?view=${view}`} className="home-app-tab">
            {VIEW_LABELS[view]}
          </Link>
        ))}
      </nav>

      <div className="home-nav__right">
        {now && <span className="home-nav__clock">Dubai · {dubaiClock(now)}</span>}
        <ThemeToggle />
        {!signedIn && <Link href="/login" className="home-nav__login">Sign in</Link>}
        <Link href={signedIn ? "/home" : "/#plan-lab"} className="home-nav__signin">
          {signedIn ? "Make a plan" : "Start a plan"}
        </Link>
      </div>
    </header>
  );
}
