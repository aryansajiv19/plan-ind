import type { Metadata } from "next";
import Link from "next/link";
import LandingNav from "@/components/landing/LandingNav";
import DemoJourney from "@/components/demo/DemoJourney";
import { NoGooglePhotos } from "@/components/VenuePhoto";
import { loadDemoDecks } from "@/components/demo/demoDecks";

// The playable sample journey: pick a kind of night, the deal, three rounds,
// a final, the reveal, booking, calendar, getting there. No account and no
// writes: dinner is the fixture (components/demo/sampleDecision.ts), the
// other kinds come from the cached curated catalogue (demoDecks.ts). Not the
// live vote page, because the seeded /plan/1111… row is membership scoped and a
// signed-out visitor meets "This plan wouldn't open" there. Labelled as
// sample data on every stage, like /demo (house rule 1).
//
// force-dynamic for the same reason as /demo: a prerendered page would bake
// in the build hour's data-theme stamp (app/layout.tsx).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sample vote",
  description: "Try it with no sign-up: pick a kind of night, and a sample group votes nine Dubai places down to one.",
};

/** The sample's "Thursday": the next one at 8pm Dubai time (UTC+4, no DST). */
function nextThursdayEvening(now: Date): string {
  const dubai = new Date(now.getTime() + 4 * 3_600_000);
  const days = (4 - dubai.getUTCDay() + 7) % 7 || 7;
  return new Date(Date.UTC(dubai.getUTCFullYear(), dubai.getUTCMonth(), dubai.getUTCDate() + days, 16)).toISOString();
}

export default async function DemoVotePage() {
  const decks = await loadDemoDecks();
  return (
    <>
    <LandingNav />
    {/* The bottom padding under 520px clears the fixed tab bar, as
        .home-experience does (app/styles/breakpoints.css).
        The banner sits inside <main>: .vote-experience isolates and paints a
        fixed backdrop, which would cover a sibling rendered before it. */}
    <main className="vote-experience mx-auto w-full max-w-4xl px-4 py-6 sm:py-10">
      <p className="home-demo-banner" role="note">
        <strong>Sample data.</strong> Real places, a made up group. Your votes stay on this screen and nothing saves.{" "}
        <Link href="/login" className="inline-flex min-h-11 items-center">Start a plan</Link>
      </p>
      <NoGooglePhotos>
        <DemoJourney decks={decks} eventTime={nextThursdayEvening(new Date())} />
      </NoGooglePhotos>
    </main>
    </>
  );
}
