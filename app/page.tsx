import Link from "next/link";
import StartPlanForm from "@/components/StartPlanForm";

// The seeded demo plan — a quick way to test the vote loop directly.
const DEMO_PLAN_ID = "11111111-1111-1111-1111-111111111111";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <div className="text-center">
        <p className="font-display text-sm font-bold uppercase tracking-[0.14em] text-grape">
          Dubai dinner decider
        </p>
        <h1 className="mt-3 text-5xl font-extrabold leading-[0.95]">
          Stop deciding.
          <br />
          Start <span className="text-punch">eating.</span>
        </h1>
        <p className="mt-4 text-muted">
          Deal three spots, let friends vote, and let the app break the tie.
        </p>
      </div>

      <div className="mt-9">
        <StartPlanForm />
      </div>

      <p className="mt-8 text-center text-xs text-muted">
        Just testing?{" "}
        <Link href={`/plan/${DEMO_PLAN_ID}`} className="font-bold text-grape underline">
          Open the demo plan
        </Link>
      </p>
    </main>
  );
}
