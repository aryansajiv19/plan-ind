// Roman round markers are After Dark's, and night-only — "III" does not fit
// the 2.1rem day dot. Always paired with the arabic original for assistive
// tech, which reads "Round 3" properly and "Round III" as "Round eye-eye-eye".
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

/** The round dots: one button per pool, marked once this voter has chosen in it. */
export function RoundDots({
  poolCount,
  activePool,
  chosen,
  nightMode,
  onSelect,
}: {
  poolCount: number;
  activePool: number;
  /** Pool numbers this voter has already picked in. */
  chosen: ReadonlySet<number>;
  nightMode: boolean;
  onSelect: (poolNumber: number) => void;
}) {
  return (
    <nav className="vote-pool-progress" aria-label="Voting pools">
      {Array.from({ length: poolCount }, (_, index) => index + 1).map((poolNumber) => (
        <button
          key={poolNumber}
          type="button"
          onClick={() => onSelect(poolNumber)}
          aria-current={activePool === poolNumber ? "step" : undefined}
          data-complete={chosen.has(poolNumber) || undefined}
          aria-label={`Round ${poolNumber} of ${poolCount}${chosen.has(poolNumber) ? ", chosen" : ""}`}
        >
          <span aria-hidden="true">{nightMode ? roman(poolNumber) : poolNumber}</span>
        </button>
      ))}
    </nav>
  );
}
