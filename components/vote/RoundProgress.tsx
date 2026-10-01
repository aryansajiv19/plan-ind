// Roman round numbers are After Dark's, night-only, in the round label.
// Always paired with the arabic original for assistive tech, which reads
// "Round 3" properly and "Round III" as "Round eye-eye-eye".
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const roman = (n: number) => ROMAN[n - 1] ?? String(n);

/** "Round 2 of 3 · choose one", or the final shortlist's label. */
export function RoundLabel({
  stage,
  activePool,
  poolCount,
  nightMode,
}: {
  stage: "pool" | "final";
  activePool: number;
  poolCount: number;
  nightMode: boolean;
}) {
  return (
    <p className="vote-round-label">
      <span className="sr-only">
        {stage === "pool" ? `Round ${activePool} of ${poolCount} · choose one` : "Final shortlist · choose one"}
      </span>
      <span aria-hidden="true">
        {stage === "pool"
          ? nightMode
            ? `Round ${roman(activePool)} of ${roman(poolCount)} · choose one`
            : `Round ${activePool} of ${poolCount} · choose one`
          : "Final shortlist · choose one"}
      </span>
    </p>
  );
}

/**
 * The bracket: one button per round, each wired down into the final. A wire
 * lights once this voter has chosen in its round, and the trunk into the
 * final lights when every round has a pick.
 */
export function RoundDots({
  poolCount,
  activePool,
  chosen,
  onSelect,
}: {
  poolCount: number;
  activePool: number;
  /** Pool numbers this voter has already picked in. */
  chosen: ReadonlySet<number>;
  onSelect: (poolNumber: number) => void;
}) {
  const rounds = Array.from({ length: poolCount }, (_, index) => index + 1);
  return (
    <nav
      className="vote-pool-progress"
      aria-label="Voting pools"
      data-all={rounds.every((poolNumber) => chosen.has(poolNumber)) || undefined}
      style={{ "--rounds": poolCount } as React.CSSProperties}
    >
      <div className="vote-pool-progress__rounds">
        {rounds.map((poolNumber) => (
          <button
            key={poolNumber}
            type="button"
            onClick={() => onSelect(poolNumber)}
            aria-current={activePool === poolNumber ? "step" : undefined}
            data-complete={chosen.has(poolNumber) || undefined}
            aria-label={`Round ${poolNumber} of ${poolCount}${chosen.has(poolNumber) ? ", chosen" : ""}`}
          >
            <span aria-hidden="true">{poolNumber}</span>
          </button>
        ))}
      </div>
      <span className="vote-pool-progress__final" aria-hidden="true">Final</span>
    </nav>
  );
}
