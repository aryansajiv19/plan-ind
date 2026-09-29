import type { DubaiExplored } from "@/lib/dubai-explored";

// "Your Dubai": districts light up as you go out in them, and the Dubai icons
// fill in one by one. Collection, not score: the unvisited ones stay visible.
export default function DubaiExploredCard({ explored, sample = false }: { explored: DubaiExplored; sample?: boolean }) {
  const { districts, districtsBeen, percent, icons, iconsDone, next } = explored;
  return (
    <section className="explored" aria-labelledby="explored-title">
      <header className="explored__head">
        <h2 id="explored-title">Your Dubai{sample ? " · sample" : ""}</h2>
        <p className="explored__percent">
          <strong>{percent}%</strong> explored
          <span> · {districtsBeen} of {districts.length} districts</span>
        </p>
      </header>

      <ul className="explored__districts">
        {districts.map((d) => (
          <li key={d.name} className="explored__district" data-been={d.been > 0 || undefined}>
            <span className="explored__mark" aria-hidden="true" />
            <span className="explored__name">{d.name}</span>
            <span className="explored__count">{d.been > 0 ? `${d.been} of ${d.total}` : d.total > 0 ? `${d.total} to try` : "soon"}</span>
          </li>
        ))}
      </ul>
      {next && (
        <p className="explored__next">
          Next up: <strong>{next.name}</strong>, {next.total} {next.total === 1 ? "place" : "places"} you haven&rsquo;t tried.
        </p>
      )}

      <div className="explored__icons">
        <div className="explored__icons-head">
          <h3>Dubai icons</h3>
          <span>{iconsDone} of {icons.length}</span>
        </div>
        <div className="explored__bar" role="progressbar" aria-label="Dubai icons done" aria-valuemin={0} aria-valuemax={icons.length} aria-valuenow={iconsDone}>
          <span style={{ width: `${(iconsDone / icons.length) * 100}%` }} />
        </div>
        <ul className="explored__icon-list">
          {icons.map((icon) => (
            <li key={icon.spotId} data-done={icon.done || undefined} title={icon.done ? `Done: ${icon.label}` : icon.label}>
              {icon.label}
              {icon.done && <span className="sr-only"> (done)</span>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
