"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { signOut } from "@/app/auth/actions";
import { clearMe } from "@/lib/device";
import DemoAccountViews from "@/components/DemoAccountViews";
import AccountViews from "@/components/AccountViews";
import type { ProfileVisit, Spot, WrappedSummary, WrappedSummaryError } from "@/lib/types";
import type { PlannedWith, VisitCollectionView, VisitPhotoView } from "@/lib/social";
import StartPlanForm from "@/components/StartPlanForm";
import { haptic } from "@/lib/interaction";
import { THEME_KEY, subscribeToGround, currentGround } from "@/lib/dubai-phase";
import WeightRise from "@/components/WeightRise";
import PhotoWall, { type WallItem } from "@/components/PhotoWall";
import CardStackExample from "@/components/kokonutui/card-stack";
import ActionSearchBar from "@/components/kokonutui/action-search-bar";

const DEMO_PLAN_ID = "11111111-1111-1111-1111-111111111111";

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

function viewFromParam(value: string | null | undefined): AppView {
  return APP_VIEWS.includes(value as AppView) ? (value as AppView) : "plan";
}

export default function HomeExperience({
  name,
  age = 21,
  demoMode = false,
  fixtures = false,
  initialView = "plan",
  personId = null,
  spots = [],
  visits = [],
  plannedWith = [],
  wrappedSummary = null,
  wrappedUnavailable = null,
  collections = [],
  photos = [],
}: {
  name: string;
  age?: number;
  /** No session: show the pitch, and the composer in its sign-in-first state. */
  demoMode?: boolean;
  /**
   * Render `DemoAccountViews` — invented friends, visits and photos. Only ever
   * true on the dev-only `/home-preview`. The public front door sets demoMode
   * WITHOUT this: a marketing hero is illustrative, an account tab full of
   * fixtures is a fabricated person. House rule 1.
   */
  fixtures?: boolean;
  initialView?: AppView;
  personId?: string | null;
  spots?: Spot[];
  visits?: ProfileVisit[];
  plannedWith?: PlannedWith[];
  wrappedSummary?: WrappedSummary | null;
  wrappedUnavailable?: WrappedSummaryError | null;
  collections?: VisitCollectionView[];
  photos?: VisitPhotoView[];
}) {
  const [ready, setReady] = useState(false);
  // Resolved after mount so it matches the reader's clock rather than the
  // server's, and so the markup is stable for hydration. The hero has always
  // said "Good evening" regardless of the hour.
  const greeting = ready ? greetingFor(new Date()) : "Hello";
  const [selectedView, setSelectedView] = useState<AppView>(initialView);
  // Read from the document, never mirrored into state — see subscribeToGround.
  const nightMode =
    useSyncExternalStore(subscribeToGround, currentGround, () => "day") === "night";

  // The account tabs need an account behind them. Signed out there is only the
  // pitch and the composer, so the tab bar, the avatar and every account view
  // are off — there is nothing truthful to put in them.
  const accountTabs = !demoMode || fixtures;
  const activeView: AppView = accountTabs ? selectedView : "plan";

  // The wall shows the catalog we already load for Discover — no second
  // fetch, and no invented content: a spot with no photo renders its
  // typographic tile rather than a placeholder image.
  const wallItems: WallItem[] = useMemo(
    () =>
      spots.slice(0, 12).map((spot) => ({
        id: spot.id,
        kind: "photo" as const,
        spot,
      })),
    [spots],
  );

  // Tabs live in the URL so Back leaves the tab rather than the app, and each
  // tab keeps its own scroll offset the way a native tab bar does.
  //
  // Deliberately window.history rather than router.push: this route's Server
  // Component runs three Supabase queries, and a router navigation would
  // re-run all of them on every tab tap. Next supports the native History API
  // for exactly this — the URL updates with no server round trip.
  const viewRef = useRef<AppView>(initialView);
  const scrollOffsets = useRef<Partial<Record<AppView, number>>>({});
  const swipeStartX = useRef<number | null>(null);

  const goToView = useCallback((next: AppView, push: boolean) => {
    const current = viewRef.current;
    if (current === next) return;
    haptic(6);
    scrollOffsets.current[current] = window.scrollY;
    viewRef.current = next;
    setSelectedView(next);
    if (push) {
      const url = next === "plan"
        ? window.location.pathname
        : `${window.location.pathname}?view=${next}`;
      window.history.pushState({ view: next }, "", url);
    }
  }, []);

  // Applied after the new view has been committed, not in the click handler:
  // scrolling before React swaps the content just gets undone when the old,
  // taller screen unmounts. An unvisited tab opens at the top; a tab you have
  // been in before returns to where you left it.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      // Don't fight the browser on a fresh load or a deep link.
      firstRender.current = false;
      return;
    }
    // Jump, never smooth-scroll: a tab change is a screen change, and easing
    // between two unrelated screens reads as the page sliding under you.
    window.scrollTo({ top: scrollOffsets.current[activeView] ?? 0, behavior: "auto" });
  }, [activeView]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      // The theme is applied by ThemeSync against <html>; this effect only
      // opens the entrance now.
      setReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      goToView(viewFromParam(params.get("view")), false);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [goToView]);

  function showView(view: AppView) {
    goToView(view, true);
  }

  function onTouchStart(event: React.TouchEvent<HTMLElement>) {
    swipeStartX.current = event.touches[0]?.clientX ?? null;
  }

  function onTouchEnd(event: React.TouchEvent<HTMLElement>) {
    const start = swipeStartX.current;
    swipeStartX.current = null;
    const end = event.changedTouches[0]?.clientX;
    if (start === null || end === undefined || Math.abs(end - start) < 64) return;
    const index = APP_VIEWS.indexOf(viewRef.current);
    const nextIndex = end < start ? index + 1 : index - 1;
    if (nextIndex >= 0 && nextIndex < APP_VIEWS.length) showView(APP_VIEWS[nextIndex]);
  }

  // The theme lives on <html data-theme>, set server-side from the Dubai clock
  // and kept honest by ThemeSync. This used to be a local `--night` class on
  // this one element, which meant the page could disagree with the document:
  // the tokens went dark while the class-scoped rules stayed light, and the
  // primary CTA rendered cream-on-cream. There is one switch now.
  function toggleNightMode() {
    const next = nightMode ? "day" : "night";
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage blocked: the override still applies for this page view.
    }
  }

  // SPECS.md §14.3: scroll-based depth drift on the front-door hero.
  // Distinct from TiltCard's pointer parallax (unchanged) — this is for
  // anyone not hovering with a mouse, i.e. most real usage. A single
  // scroll-position custom property, not a JS animation loop: this effect
  // only computes the number and writes it via setProperty; the actual
  // motion is plain CSS (.home-hero__copy / .home-stage in globals.css).
  const heroRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!demoMode) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const hero = heroRef.current;
    if (!hero) return;
    let ticking = false;
    function applyHeroScroll() {
      const rect = hero!.getBoundingClientRect();
      // 0 while the hero's top hasn't scrolled past the viewport top, then
      // ramps up as it does, capped at the hero's own height — a small
      // range scoped to depth within the hero, not full-page parallax.
      const clamped = Math.min(Math.max(0, -rect.top), rect.height);
      hero!.style.setProperty("--hero-scroll", `${clamped}px`);
    }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        applyHeroScroll();
        ticking = false;
      });
    }
    applyHeroScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [demoMode]);

  return (
    <main onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} className={`home-experience ${ready ? "home-experience--ready" : ""}`}>
      <div className="home-grid-field" aria-hidden="true" />

      <header className="home-nav">
        <a href="#top" className="home-logo" aria-label="Deal three home">
          <span>D/</span>
          <span className="home-logo__three">03</span>
        </a>

        {accountTabs && (
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
        )}

        <div className="home-nav__right">
          {accountTabs && (
            <div className="home-nav__search" style={{ maxWidth: "18rem" }}>
              <ActionSearchBar />
            </div>
          )}
          {accountTabs && (
            <button type="button" className="home-nav__link" onClick={() => showView("plan")}>Make a plan</button>
          )}
          <button
            type="button"
            className="home-theme-toggle"
            onClick={toggleNightMode}
            aria-pressed={nightMode}
          >
            {nightMode ? "Day" : "Night"}
          </button>
          {accountTabs ? (
            <button
              type="button"
              className="home-avatar"
              aria-label="Open profile"
              title="Profile"
              onClick={() => showView("profile")}
            >
              {name.slice(0, 1).toUpperCase()}
            </button>
          ) : (
            <Link href="/login" className="home-nav__signin">Sign in</Link>
          )}
        </div>
      </header>

      {activeView === "plan" ? (
      <div id="workspace">
      {/* The hero is the signed-out pitch. A signed-in account opens straight
          onto the composer the way an app opens onto its first screen.
          scrolling past a marketing headline to reach your own tool is a
          website habit, and on a phone it costs the whole first screen. */}
      {demoMode ? (
      <section id="top" ref={heroRef} className="home-hero" aria-labelledby="home-title">
        <div className="home-hero__copy">
          <p className="home-hello home-reveal" style={{ "--delay": "80ms" } as React.CSSProperties}>
            {greeting}, {name}.
          </p>

          <h1 id="home-title" className="home-title" aria-label="Dubai plans without the group chat.">
            <span className="home-title__line home-title__line--one">
              Dubai plans,
            </span>
            <span className="home-title__line home-title__line--two">
              without the
            </span>
            <span className="home-title__line home-title__line--three">
              {/* Only the last line rises: the weight change is the emphasis,
                  so spending it on every line would spend it on nothing. */}
              <strong><WeightRise delay={0.51}>group chat.</WeightRise></strong>
            </span>
          </h1>

          <p className="home-deck home-reveal" style={{ "--delay": "680ms" } as React.CSSProperties}>
            Dinner in DIFC, padel in Al Quoz, or a beach day on the Palm. Set the budget and distance, shortlist through three pools, and let everyone choose.
          </p>

          <div className="home-actions home-reveal" style={{ "--delay": "780ms" } as React.CSSProperties}>
            <a href="#plan-lab" className="home-primary-cta">
              Open a decision
            </a>
            {/* The sample plan is a seeded row that only a signed-in reader can
                fetch under the post-020 policies, so a signed-out visitor sent
                there meets "plan not found". Dev preview keeps the link;
                the public door offers the thing that does work. */}
            {fixtures ? (
              <Link href={`/plan/${DEMO_PLAN_ID}`} className="home-secondary-cta">
                See a sample vote
              </Link>
            ) : (
              <Link href="/login" className="home-secondary-cta">
                Sign in to start
              </Link>
            )}
          </div>
        </div>

        <div className="home-stage home-reveal" style={{ "--delay": "420ms" } as React.CSSProperties} aria-hidden="true">
          {/* SPECS.md §5: the deck, nine places across three rounds — the
              product's real mechanic, replacing the illustrative "Tonight
              in Dubai" panel entirely. Illustrative content (not a signed-in
              account's real data): see card-stack.tsx's own note. */}
          <CardStackExample spots={spots} />
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

      {/* "Dubai, right now" — the photo wall from turn 9 / 10a.
          Fed by the real catalog. Most curated rows have no photo_url yet, so
          most tiles render their typographic state; that is the honest result
          and it is what the handoff asks for rather than padding the page. */}
      <section id="right-now" className="home-wall-section" aria-labelledby="right-now-title">
        <div className="home-plan-section__intro">
          <p className="home-section-kicker">Dubai, right now</p>
          <h2 id="right-now-title">Somewhere to put on the list</h2>
        </div>
        <PhotoWall
          items={wallItems}
          emptyMessage="No places in the catalog yet. Once spots are seeded they show up here, newest first."
        />
      </section>
      </div>
      ) : (
        <div id="workspace">
          {/* Fixtures are for the dev-only preview. A signed-in account shows
              its own data, empty states included; a signed-out visitor never
              reaches here at all. Presenting invented friends and history as
              someone's own record is not a demo. */}
          {fixtures ? (
            <DemoAccountViews view={activeView} name={name} onStartPlan={() => showView("plan")} />
          ) : (
            <AccountViews
              view={activeView}
              name={name}
              personId={personId}
              spots={spots}
              visits={visits}
              plannedWith={plannedWith}
              wrappedSummary={wrappedSummary}
              wrappedUnavailable={wrappedUnavailable}
              collections={collections}
              photos={photos}
              onStartPlan={() => showView("plan")}
            />
          )}
          {activeView === "profile" && !demoMode && (
            <form
              action={signOut}
              onSubmit={() => clearMe()}
              className="home-profile-actions"
            >
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
