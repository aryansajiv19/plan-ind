import type { Metadata } from "next";
import Link from "next/link";
import SampleVote from "@/components/demo/SampleVote";

// The playable sample decision: deal, three rounds, a final, the reveal.
// Fixture driven (components/demo/sampleDecision.ts) with no account and no
// database, because the seeded /plan/1111… row is membership scoped and a
// signed-out visitor meets "This plan wouldn't open" there. Labelled as
// sample data on every stage, like /demo (house rule 1).
//
// force-dynamic for the same reason as /demo: a prerendered page would bake
// in the build hour's data-theme stamp (app/layout.tsx).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sample vote",
  description: "Play a sample group decision: nine Dubai dinner spots, three rounds, one pick.",
};

export default function DemoVotePage() {
  return (
    // The banner sits inside <main>: .vote-experience isolates and paints a
    // fixed backdrop, which would cover a sibling rendered before it.
    <main className="vote-experience mx-auto w-full max-w-4xl px-4 py-6 sm:py-10">
      <p className="home-demo-banner mb-4 rounded-2xl border border-line" role="note">
        <strong>Sample data.</strong> A made up group deciding dinner. Your votes stay on this screen and nothing saves.{" "}
        <Link href="/login" className="inline-flex min-h-11 items-center">Start your own plan →</Link>
      </p>
      <SampleVote />
    </main>
  );
}
