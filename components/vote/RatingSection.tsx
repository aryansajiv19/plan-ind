import type { Rating } from "@/lib/types";
import UnrateButton from "@/components/UnrateButton";
import { useMinuteClock } from "@/hooks/use-minute-clock";

// After the visit: rate the winner, and see how the group rated it.
export default function RatingSection({
  planId,
  spotId,
  opensAt,
  isMine,
  ratings,
  onRate,
}: {
  planId: string;
  spotId: string;
  /** When rating opens (P11); null on legacy plans, which stay open. */
  opensAt: string | null;
  isMine: (rating: Rating) => boolean;
  ratings: Rating[];
  onRate: (partial: { stars?: number; again?: boolean }) => void;
}) {
  const now = useMinuteClock();
  const myRating = ratings.find(isMine);
  const avgStars =
    ratings.length > 0
      ? ratings.reduce((s, r) => s + r.stars, 0) / ratings.length
      : 0;
  const againPct =
    ratings.length > 0
      ? Math.round(
          (ratings.filter((r) => r.again).length / ratings.length) * 100,
        )
      : 0;

  // P11: rate_plan refuses before the outing (22023), so don't offer it yet.
  if (opensAt && (!now || Date.parse(opensAt) > now.getTime())) {
    return <p className="mt-4 border-t border-line pt-4 text-sm text-muted">Rate it after you’ve been.</p>;
  }

  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">
          Been? Rate it
        </p>
        {ratings.length > 0 && (
          <p className="text-xs font-semibold text-muted tabular-nums">
            {avgStars.toFixed(1)} / 5 · {ratings.length} rated · {againPct}% would go again
          </p>
        )}
      </div>

      <div className="mt-2 flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onRate({ stars: n })}
            aria-label={`Rate ${n} out of 5`}
            aria-pressed={(myRating?.stars ?? 0) >= n}
            className="vote-rating-button"
          >
            {n}
          </button>
        ))}
        {myRating && (
          <span className="ml-1 text-sm text-muted">your rating</span>
        )}
        {myRating && <UnrateButton planId={planId} spotId={spotId} />}
      </div>

      {myRating && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-sm text-muted">Would you go again?</span>
          <button
            type="button"
            onClick={() => onRate({ again: true })}
            aria-pressed={myRating.again}
            className={[
              "vote-toggle",
              myRating.again ? "vote-toggle--on" : "",
            ].join(" ")}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => onRate({ again: false })}
            aria-pressed={!myRating.again}
            className={[
              "vote-toggle",
              !myRating.again ? "vote-toggle--on" : "",
            ].join(" ")}
          >
            Not really
          </button>
        </div>
      )}
    </div>
  );
}
