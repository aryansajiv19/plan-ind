import Link from "next/link";
import WinnerReveal from "@/components/WinnerReveal";
import { avatarStyle, initialsOf } from "@/lib/avatar";
import { categoryMeta } from "@/lib/categories";
import { votersFor, yesCount, type Round } from "@/lib/tally";
import type { Spot, Vote } from "@/lib/types";
import { SAMPLE_FRIENDS, SAMPLE_POOLS } from "@/components/demo/sampleDecision";

const GROUP_SIZE = SAMPLE_FRIENDS.length + 1;
const FINAL: Round = { phase: "final", poolNumber: 0 };

/**
 * The sample's decided screen: the real WinnerReveal, then a compact recap of
 * how the group got there. DecidedPlan itself is not reused: its RSVP,
 * carpool, booking and rating controls all write to the server, and offering
 * them here would be controls that pretend to save.
 */
export default function SampleDecided({
  winner,
  votes,
  finalists,
  onReplay,
}: {
  winner: Spot;
  votes: Vote[];
  finalists: string[];
  onReplay: () => void;
}) {
  const finalVoters = votersFor(votes, winner.id, FINAL);
  const counts = finalists.map((id) => yesCount(votes, id, FINAL));
  const tied = counts.filter((n) => n === Math.max(...counts)).length > 1;

  return (
    <>
      <div className="vote-result mt-6 rounded-2xl border-2 border-punch bg-punch/5 p-4 sm:p-5">
        <WinnerReveal name={winner.name} photoUrl={winner.photo_url} alt={`${winner.name}, ${winner.area}`} />

        <div className="flex items-center gap-3">
          <span className="vote-result__category grid h-12 w-12 shrink-0 place-items-center rounded-xl text-2xl" aria-hidden="true">
            {categoryMeta(winner.category).code}
          </span>
          <div>
            <p className="vote-kicker text-xs font-bold uppercase tracking-wide">Decided · you’re going</p>
            <p className="mt-1 inline-flex items-center gap-2 text-sm text-muted">
              <span className="vote-face-stack" aria-hidden="true">
                {finalVoters.map((name) => (
                  <span key={name} style={avatarStyle(name)}>{initialsOf(name)}</span>
                ))}
              </span>
              <span>
                {finalVoters.length} of {GROUP_SIZE} picked it in the final
                {tied ? ". A tie goes to the earlier card" : ""}.
                <span className="sr-only"> {finalVoters.join(", ")}.</span>
              </span>
            </p>
          </div>
        </div>

        <p className="vote-result__details mt-3 text-sm">
          {winner.description ?? winner.vibe}
          <span className="text-muted"> · {winner.area} · Open till {winner.open_till} · from AED {winner.min_spend}pp</span>
        </p>

        <div className="mt-4 border-t border-line pt-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">How the group got here</p>
          <ol className="mt-2 grid gap-1.5 text-sm">
            {finalists.map((id, index) => {
              const spot = SAMPLE_POOLS[index].find((candidate) => candidate.id === id);
              const round: Round = { phase: "pool", poolNumber: index + 1 };
              return (
                <li key={id} className="flex justify-between gap-3">
                  <span><span className="text-muted">Round {index + 1} · </span>{spot?.name}</span>
                  <span className="shrink-0 tabular-nums text-muted">{yesCount(votes, id, round)} of {GROUP_SIZE}</span>
                </li>
              );
            })}
            <li className="flex justify-between gap-3 font-medium">
              <span><span className="text-muted">Final · </span>{winner.name}</span>
              <span className="shrink-0 tabular-nums">{finalVoters.length} of {GROUP_SIZE}</span>
            </li>
          </ol>
          <p className="mt-3 text-sm text-muted">
            On a real plan this is where everyone RSVPs, sorts out a carpool, claims the booking and adds it to their calendar.
          </p>
        </div>
      </div>

      {/* Outside .vote-result on purpose: its `a` rule recolours links to
          champagne, which would put champagne text on the ink-filled CTA. */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <Link href="/login" className="vote-primary-action flex-1 rounded-2xl border-2 border-ink text-lg">
          Start your own plan
        </Link>
        <button type="button" onClick={onReplay} className="vote-secondary-action rounded-2xl border-2 border-ink bg-card">
          Play it again
        </button>
      </div>
    </>
  );
}
