"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { signOut } from "@/app/auth/actions";
import DemoAccountViews from "@/components/DemoAccountViews";
import AccountViews from "@/components/AccountViews";
import type { PersonCard, ProfileVisit, Spot } from "@/lib/types";
import StartPlanForm from "@/components/StartPlanForm";

const DEMO_PLAN_ID = "11111111-1111-1111-1111-111111111111";

const DECISION_ROWS = [
  { number: "01", title: "Ninive", area: "Emirates Towers", time: "21:30", votes: "4 votes" },
  { number: "02", title: "The Guild", area: "DIFC", time: "21:45", votes: "1 vote" },
  { number: "03", title: "Koko Bay", area: "Palm Jumeirah", time: "20:30", votes: "1 vote" },
] as const;

const APP_VIEWS = ["plan", "discover", "been", "friends", "profile"] as const;
type AppView = (typeof APP_VIEWS)[number];

const VIEW_LABELS: Record<AppView, string> = {
  plan: "Plan",
  discover: "Discover",
  been: "Been",
  friends: "Friends",
  profile: "Profile",
};

function greetingFor(now: Date): string {
  const hour = now.getHours();
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function HomeExperience({
  name,
  age = 21,
  demoMode = false,
  spots = [],
  visits = [],
  friends = [],
}: {
  name: string;
  age?: number;
  demoMode?: boolean;
  personId?: string | null;
  spots?: Spot[];
  visits?: ProfileVisit[];
  friends?: PersonCard[];
}) {
  const [ready, setReady] = useState(false);
  // Resolved after mount so it matches the reader's clock rather than the
  // server's, and so the markup is stable for hydration. The hero has always
  // said "Good evening" regardless of the hour.
  const greeting = ready ? greetingFor(new Date()) : "Hello";
  const [activeView, setActiveView] = useState<AppView>("plan");
  const [nightMode, setNightMode] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setNightMode(window.localStorage.getItem("deal-three:theme") === "night");
      setReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function showView(view: AppView) {
    setActiveView(view);
    window.requestAnimationFrame(() => {
      document.getElementById("workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function toggleNightMode() {
    setNightMode((current) => {
      const next = !current;
      window.localStorage.setItem("deal-three:theme", next ? "night" : "day");
      return next;
    });
  }

  return (
    <main className={`home-experience ${ready ? "home-experience--ready" : ""} ${nightMode ? "home-experience--night" : ""}`}>
      <div className="home-grid-field" aria-hidden="true" />

      <header className="home-nav">
        <a href="#top" className="home-logo" aria-label="Deal three home">
          <span>D/</span>
          <span className="home-logo__three">03</span>
        </a>

        <nav className="home-app-tabs" aria-label="Main app navigation">
          {APP_VIEWS.map((view) => (
            <button
              key={view}
              type="button"
              onClick={() => showView(view)}
              aria-current={activeView === view ? "page" : undefined}
              className="home-app-tab"
            >
              {VIEW_LABELS[view]}
            </button>
          ))}
        </nav>

        <div className="home-nav__right">
          <button type="button" className="home-nav__link" onClick={() => showView("plan")}>Make a plan</button>
          <button
            type="button"
            className="home-theme-toggle"
            onClick={toggleNightMode}
            aria-pressed={nightMode}
          >
            {nightMode ? "Day" : "Night"}
          </button>
          <button
            type="button"
            className="home-avatar"
            aria-label="Open profile"
            title="Profile"
            onClick={() => showView("profile")}
          >
            {name.slice(0, 1).toUpperCase()}
          </button>
        </div>
      </header>

      {activeView === "plan" ? (
      <div id="workspace">
      {/* The hero is the signed-out pitch. A signed-in account opens straight
          onto the composer the way an app opens onto its first screen —
          scrolling past a marketing headline to reach your own tool is a
          website habit, and on a phone it costs the whole first screen. */}
      {demoMode ? (
      <section id="top" className="home-hero" aria-labelledby="home-title">
        <div className="home-hero__copy">
          <p className="home-hello home-reveal" style={{ "--delay": "80ms" } as React.CSSProperties}>
            Good evening, {name}.
          </p>

          <h1 id="home-title" className="home-title" aria-label="Dubai plans without the group chat.">
            <span className="home-title__line home-title__line--one">
              Dubai plans,
            </span>
            <span className="home-title__line home-title__line--two">
              without the
            </span>
            <span className="home-title__line home-title__line--three">
              <strong>group chat.</strong>
            </span>
          </h1>

          <p className="home-deck home-reveal" style={{ "--delay": "680ms" } as React.CSSProperties}>
            Dinner in DIFC, padel in Al Quoz, or a beach day on the Palm. Set the budget and distance, shortlist through three pools, and let everyone choose.
          </p>

          <div className="home-actions home-reveal" style={{ "--delay": "780ms" } as React.CSSProperties}>
            <a href="#plan-lab" className="home-primary-cta">
              Open a decision
            </a>
            <Link href={`/plan/${DEMO_PLAN_ID}`} className="home-secondary-cta">
              See a sample vote
            </Link>
          </div>
        </div>

        <div className="home-stage home-reveal" style={{ "--delay": "420ms" } as React.CSSProperties} aria-hidden="true">
          <div className="home-system-shadow" />
          <div className="home-system">
            <div className="home-system__header">
              <span>Tonight in Dubai</span>
              <span className="home-system__status">6 friends voting</span>
            </div>

            <div className="home-system__measure">
              <div>
                <span className="home-system__label">Places shortlisted</span>
                <strong>03</strong>
              </div>
              <div className="home-system__coordinates">
                <span>Emirates Towers</span>
                <span>DIFC</span>
                <span>Palm Jumeirah</span>
              </div>
            </div>

            <div className="home-system__rows">
              {DECISION_ROWS.map((row, index) => (
                <div key={row.number} className={`home-system-row ${index === 0 ? "home-system-row--active" : ""}`}>
                  <span className="home-system-row__number">{row.number}</span>
                  <span className="home-system-row__name">
                    <strong>{row.title}</strong>
                    <small>{row.area}</small>
                  </span>
                  <span className="home-system-row__time">{row.time}</span>
                  <span className="home-system-row__votes">{row.votes}</span>
                </div>
              ))}
            </div>

            <div className="home-system__footer">
              <span>Friday · 9:30 PM</span>
              <span>Voting closes 8:00 PM</span>
              <b>Open</b>
            </div>
          </div>

        </div>
      </section>
      ) : (
        <section id="top" className="home-appbar" aria-labelledby="home-title">
          <p className="home-appbar__hello">{greeting}, {name}.</p>
          <h1 id="home-title" className="home-appbar__title">What are we doing?</h1>
        </section>
      )}

      <section id="plan-lab" className="home-plan-section">
        <div className="home-plan-section__intro">
          <p className="home-section-kicker">Create a plan</p>
          <h2>{demoMode ? "What does the group feel like doing?" : "Set the shape of the night"}</h2>
          <p>Choose the category, budget and travel radius. We’ll deal nine relevant places across three quick rounds.</p>
        </div>

        <div className="home-plan-card">
          <div className="home-plan-card__tape" aria-hidden="true">New plan</div>
          <StartPlanForm age={age} demoMode={demoMode} />
        </div>
      </section>
      </div>
      ) : (
        <div id="workspace">
          {/* Fixtures are for the signed-out preview only. A signed-in account
              shows its own data, empty states included — presenting invented
              friends and history as someone's own record is not a demo. */}
          {demoMode ? (
            <DemoAccountViews view={activeView} name={name} onStartPlan={() => showView("plan")} />
          ) : (
            <AccountViews view={activeView} name={name} spots={spots} visits={visits} friends={friends} onStartPlan={() => showView("plan")} />
          )}
          {activeView === "profile" && (
            <form action={signOut} className="home-profile-actions">
              <span>Signed in as {name}</span>
              <button type="submit">Sign out</button>
            </form>
          )}
        </div>
      )}

      <footer className="home-footer">
        <span>Deal three © 2026 · Dubai</span>
        <a href="#top">Back to top</a>
      </footer>
    </main>
  );
}
