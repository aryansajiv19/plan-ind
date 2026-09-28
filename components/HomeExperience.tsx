"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PersonCard, ProfileVisit, Spot, WrappedSummary, WrappedSummaryError } from "@/lib/types";
import type { PlannedWith, VisitCollectionView, VisitPhotoView } from "@/lib/social";
import StartPlanForm from "@/components/StartPlanForm";
import type { PlanPrefill } from "@/lib/board-plan";
import { takeDraft } from "@/lib/plan-draft";
import type { CuratedCounts } from "@/lib/spots/catalogue";
import { haptic } from "@/lib/interaction";
import PhotoWall, { type WallItem } from "@/components/PhotoWall";
import HomeHero from "@/components/home/HomeHero";
import LandingNav from "@/components/landing/LandingNav";
import HowItWorks from "@/components/landing/HowItWorks";
import YourPlans, { type PlanSummary } from "@/components/home/YourPlans";
import { APP_VIEWS, VIEW_LABELS, WALL_SIZE, viewFromParam, type AppView } from "@/lib/home-views";
import ActionSearchBar from "@/components/kokonutui/action-search-bar";
import { greetingFor } from "@/lib/right-now";

// The account tabs are most of this component's weight and the signed-out
// landing never renders them, so they load as their own chunks. Still
// server-rendered, so a deep link (?view=profile) paints complete; the
// placeholder only shows during an in-app tab switch, and holds a screen's
// height so the footer doesn't jump up and back.
const viewLoading = () => <div aria-busy="true" style={{ minHeight: "100dvh" }} />;
const AccountViews = dynamic(() => import("@/components/AccountViews"), { loading: viewLoading });
const DemoAccountViews = dynamic(() => import("@/components/DemoAccountViews"), { loading: viewLoading });

export default function HomeExperience({
  name,
  greeting: serverGreeting,
  emoji = null,
  age = 21,
  demoMode = false,
  fixtures = false,
  initialView = "plan",
  personId = null,
  spots = [],
  counts = null,
  visits = [],
  visitsUnavailable = false,
  photosUnavailable = false,
  myPlans = [],
  smartSearchAvailable = false,
  myPlansUnavailable = false,
  plannedWith = [],
  plannedWithUnavailable = false,
  friends = [],
  friendsUnavailable = false,
  wrappedSummary = null,
  wrappedUnavailable = null,
  collections = [],
  photos = [],
}: {
  name: string;
  /** P28: computed on the server on the Dubai clock, so the first paint says it. */
  greeting?: string;
  /** The account's chosen emoji, or null when none is chosen. */
  emoji?: string | null;
  age?: number;
  /** No session: show the pitch, and the composer in its sign-in-first state. */
  demoMode?: boolean;
  /**
   * Render `DemoAccountViews` — invented friends, visits and photos. Only ever
   * true on the labelled `/demo`. The public front door sets demoMode
   * WITHOUT this: a marketing hero is illustrative, an account tab full of
   * fixtures is a fabricated person. House rule 1.
   */
  fixtures?: boolean;
  initialView?: AppView;
  personId?: string | null;
  spots?: Spot[];
  /** Landing only: real curated counts, or null (then no counts line). */
  counts?: CuratedCounts | null;
  visits?: ProfileVisit[];
  /** The read FAILED — not "there are none". See lib/social's ListRead. */
  visitsUnavailable?: boolean;
  photosUnavailable?: boolean;
  /** Signed in: the plans this account is on (P3). */
  myPlans?: PlanSummary[];
  myPlansUnavailable?: boolean;
  /** The server has a model key (a boolean, never the key itself). */
  smartSearchAvailable?: boolean;
  plannedWith?: PlannedWith[];
  plannedWithUnavailable?: boolean;
  friends?: PersonCard[];
  friendsUnavailable?: boolean;
  wrappedSummary?: WrappedSummary | null;
  wrappedUnavailable?: WrappedSummaryError | null;
  collections?: VisitCollectionView[];
  photos?: VisitPhotoView[];
}) {
  const [ready, setReady] = useState(false);
  // Resolved after mount so it matches the reader's clock rather than the
  // server's, and so the markup is stable for hydration. The hero has always
  // said "Good evening" regardless of the hour.
  const greeting = serverGreeting ?? (ready ? greetingFor(new Date()) : "Hello");
  const [selectedView, setSelectedView] = useState<AppView>(initialView);
  // Set by "Plan from this board"; keyed so the composer remounts with it.
  const [planPrefill, setPlanPrefill] = useState<PlanPrefill | null>(null);
  // P7: what a visitor set up before signing in comes back once, here.
  useEffect(() => {
    if (demoMode) return;
    const frame = window.requestAnimationFrame(() => {
      const draft = takeDraft();
      if (draft) setPlanPrefill({ key: "draft", boardName: "", ...draft });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [demoMode]);

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
      spots.slice(0, WALL_SIZE).map((spot) => ({
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
      // Hydrated: the greeting may follow this device's clock, and the class
      // marks it for tests (theme-park). The hero's entrance no longer waits
      // for this; it is CSS from first paint.
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


  return (
    <main onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} className={`home-experience ${ready ? "home-experience--ready" : ""}`}>
      <div className="home-grid-field" aria-hidden="true" />

      {accountTabs ? (
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
          <div className="home-nav__search" style={{ maxWidth: "18rem" }}>
            <ActionSearchBar age={age} onQuickAction={showView} />
          </div>
          <button type="button" className="home-nav__link" onClick={() => showView("plan")}>Make a plan</button>
          <button
            type="button"
            className="home-avatar"
            aria-label="Open profile"
            title="Profile"
            onClick={() => showView("profile")}
          >
            {emoji ?? name.slice(0, 1).toUpperCase()}
          </button>
        </div>
      </header>
      ) : (
        <LandingNav />
      )}

      {/* Every screen in the demo is invented people and history, so the label
          rides above the tabs on all of them and cannot be dismissed. House
          rule 1: never show invented data as a signed-in user's own. */}
      {fixtures && (
        <p className="home-demo-banner" role="note">
          <strong>Sample data.</strong> This is a demo account. The people, visits and photos are made up, and nothing here saves.{" "}
          <Link href="/login?next=/home">Start your own plan →</Link>
        </p>
      )}

      {activeView === "plan" ? (
      <div id="workspace">
      {/* The hero is the signed-out pitch. A signed-in account opens straight
          onto the composer the way an app opens onto its first screen.
          scrolling past a marketing headline to reach your own tool is a
          website habit, and on a phone it costs the whole first screen. */}
      {demoMode ? (
      <HomeHero greeting={greeting} name={name} fixtures={fixtures} spots={spots} counts={counts} />
      ) : (
        <section id="top" className="home-appbar" aria-labelledby="home-title">
          {/* The heading speaks first; the greeting follows it, not a label above it. */}
          <h1 id="home-title" className="home-appbar__title">What are we doing?</h1>
          <p className="home-appbar__hello">{greeting}{name ? `, ${name}` : ""}.</p>
        </section>
      )}
      {demoMode ? <HowItWorks /> : <YourPlans plans={myPlans} unavailable={myPlansUnavailable} />}

      {/* Signed in, "What are we doing?" above is already the page's headline;
          a second big heading beside the form said the same thing again. */}
      <section id="plan-lab" className={`home-plan-section${demoMode ? "" : " home-plan-section--app"}`}>
        <div className="home-plan-section__intro">
          {demoMode && <h2>What does the group feel like doing?</h2>}
          <p className={`home-plan-steps__lede${demoMode ? " home-plan-steps__lede--pitch" : ""}`}>Pick a kind of night, pin a place if one is calling, and deal nine across three quick rounds.</p>
        </div>

        <div className="home-plan-card">
          <StartPlanForm key={planPrefill?.key} age={age} demoMode={demoMode} sampleShelf={fixtures} prefill={planPrefill} smartSearchAvailable={smartSearchAvailable} />
        </div>
      </section>

      {/* "Dubai, right now" — the photo wall from turn 9 / 10a.
          Fed by the real catalog. Most curated rows have no photo_url yet, so
          most tiles render their typographic state; that is the honest result
          and it is what the handoff asks for rather than padding the page. */}
      <section id="right-now" className="home-wall-section" aria-labelledby="right-now-title">
        <div className="home-plan-section__intro">
          <h2 id="right-now-title">Somewhere to put on the list</h2>
          {counts && (
            <p className="home-wall-counts">
              {counts.places} curated places{counts.categories ? ` across ${counts.categories} categories` : ""}, all in Dubai.
            </p>
          )}
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
            <DemoAccountViews view={activeView} name={name} onStartPlan={(prefill) => { if (prefill) setPlanPrefill(prefill); showView("plan"); }} />
          ) : (
            <AccountViews
              view={activeView}
              name={name}
              emoji={emoji}
              personId={personId}
              spots={spots}
              age={age}
              visits={visits}
              plannedWith={plannedWith}
              wrappedSummary={wrappedSummary}
              wrappedUnavailable={wrappedUnavailable}
              collections={collections}
              visitsUnavailable={visitsUnavailable}
              photosUnavailable={photosUnavailable}
              plannedWithUnavailable={plannedWithUnavailable}
              friends={friends}
              friendsUnavailable={friendsUnavailable}
              photos={photos}
              onStartPlan={() => showView("plan")}
              onPlanFromBoard={(prefill) => { setPlanPrefill(prefill); showView("plan"); }}
            />
          )}
        </div>
      )}

      <footer className="home-footer">
        <span>Deal three · Made by Aryan Sajiv in Dubai</span>
        <nav className="home-footer__links" aria-label="About Deal three">
          <a href="https://github.com/aryansajiv19/plan-ind" target="_blank" rel="noopener noreferrer">GitHub</a>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <a href="#top">Back to top</a>
        </nav>
      </footer>
    </main>
  );
}
