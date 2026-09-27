import LiveVoteLoop from "@/components/landing/LiveVoteLoop";
import { avatarStyle, initialsOf } from "@/lib/avatar";
import { categoryMeta } from "@/lib/categories";
import { FRIEND_PICKS, SAMPLE_FRIENDS, SAMPLE_POOLS, SAMPLE_VOTER } from "@/components/demo/sampleDecision";

// Dealt → voted → decided, each shown with a small piece of the real UI and
// the /demo/vote sample group (labelled: these are invented people).

const ROUND_ONE = SAMPLE_POOLS[0];
// Round one as the sample plays it: 3Fils, picked by Maya, Priya and you.
const WINNER = ROUND_ONE[FRIEND_PICKS.pool1[0]];
const PICKED_BY = [SAMPLE_FRIENDS[0], SAMPLE_FRIENDS[2], SAMPLE_VOTER];

export default function HowItWorks() {
  return (
    <section id="how" className="how" aria-labelledby="how-title">
      <div className="how__intro">
        <h2 id="how-title">From nine places to one plan</h2>
        <p className="how__note">Shown with the sample group from the demo.</p>
      </div>

      <ol className="how__steps vote-experience vote-experience--embed">
        <li className="how__step">
          <h3>Nine places, dealt</h3>
          <p>Pick a category, a budget and a distance. The nine fit all three, three to a round.</p>
          <div className="how__deal" aria-hidden="true">
            {SAMPLE_POOLS.map((pool, round) => (
              <div key={round} className="how__deal-row">
                {pool.map((spot) => (
                  <span key={spot.id} className="how__deal-card">
                    <b>{spot.name}</b>
                    <span>{spot.area}</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </li>

        <li className="how__step">
          <h3>Everyone votes</h3>
          <p>One pick per round, from any phone. Faces show who chose what, as it happens.</p>
          <div className="how__card" aria-hidden="true">
            <LiveVoteLoop />
          </div>
        </li>

        <li className="how__step">
          <h3>One place, decided</h3>
          <p>The winner, who picked it, and then who’s coming, the booking and the ride.</p>
          <div className="how__decided" aria-hidden="true">
            <span className="vote-result__category grid h-12 w-12 shrink-0 place-items-center rounded-xl text-2xl">{categoryMeta(WINNER.category).code}</span>
            <div>
              <p className="vote-kicker">Decided · you’re going</p>
              <p className="how__winner">{WINNER.name}</p>
              <p className="how__picked">
                <span className="vote-face-stack">
                  {PICKED_BY.map((name) => <span key={name} style={avatarStyle(name)}>{initialsOf(name)}</span>)}
                </span>
                3 of 5 picked it
              </p>
            </div>
          </div>
        </li>
      </ol>
    </section>
  );
}
