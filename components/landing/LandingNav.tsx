"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

// The shared top nav for every page outside /home's own. Signed in: the
// app's tabs (open on /home), the Dubai clock, "Start a plan". Signed out, a
// visitor has no app yet, so only the wordmark, the theme, "Sign in" and one
// filled action: "Try the demo", or "Start a plan" once already in it.
export default function LandingNav({ signedIn = false }: { signedIn?: boolean }) {
  const now = useMinuteClock(); // null during SSR, so the clock never mismatches
  const inDemo = usePathname()?.startsWith("/demo") ?? false;
  if (!signedIn) {
    return (
      <header className="home-nav">
        <Link href="/" className="home-logo" aria-label="Planind home">Planind</Link>
        <div className="home-nav__right">
          <ThemeToggle />
          <Link href="/login" className="home-nav__login">Sign in</Link>
          {inDemo
            ? <Link href="/#plan-lab" className="home-nav__signin">Start a plan</Link>
            : <Link href="/demo/vote" className="home-nav__signin">Try the demo</Link>}
        </div>
      </header>
    );
  }
  return (
    <header className="home-nav">
      <Link href="/" className="home-logo" aria-label="Planind home">
        Planind
      </Link>

      <nav className="home-app-tabs" aria-label="App">
        {TAB_VIEWS.map((view) => (
          <Link key={view} href={`/home?view=${view}`} className="home-app-tab">
            {VIEW_LABELS[view]}
          </Link>
        ))}
      </nav>

      <div className="home-nav__right">
        {now && <span className="home-nav__clock">Dubai · {dubaiClock(now)}</span>}
        <ThemeToggle />
        <Link href="/home" className="home-nav__signin">
          Start a plan
        </Link>
      </div>
    </header>
  );
}
