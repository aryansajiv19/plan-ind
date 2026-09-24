import ProfileNameForm from "@/components/ProfileNameForm";
import ProfileEmojiForm from "@/components/ProfileEmojiForm";
import BirthdayCorrection from "@/components/BirthdayCorrection";
import WrappedRecap from "@/components/account/WrappedRecap";
import type { VisitStats } from "@/components/account/useVisitStats";
import { initialsOf } from "@/lib/avatar";
import type { PlannedWith } from "@/lib/social";
import type { WrappedSummary, WrappedSummaryError } from "@/lib/types";

export default function ProfileTab({
  name,
  emoji,
  personId,
  stats,
  plannedWith,
  wrappedSummary,
  wrappedUnavailable,
}: {
  name: string;
  emoji: string | null;
  personId: string | null;
  stats: VisitStats;
  plannedWith: PlannedWith[];
  wrappedSummary: WrappedSummary | null;
  wrappedUnavailable: WrappedSummaryError | null;
}) {
  return (
    <section className="demo-view" aria-labelledby="profile-title">
      <header className="demo-profile-head">
        <span className={`demo-profile-avatar${emoji ? " demo-profile-avatar--emoji" : ""}`} aria-hidden="true">{emoji ?? initialsOf(name)}</span>
        <div><p className="home-section-kicker">Your account</p><h1 id="profile-title">{name}</h1><p>Dubai</p></div>
      </header>

      {personId && <ProfileNameForm personId={personId} name={name} />}
      {personId && <ProfileEmojiForm personId={personId} emoji={emoji} />}
      {personId && <BirthdayCorrection />}

      <div className="demo-profile-stats">
        <span><strong>{stats.places}</strong> places</span>
        <span><strong>{stats.total}</strong> visits</span>
        <span><strong>{plannedWith.length}</strong> people</span>
      </div>

      {stats.areas.length > 0 ? (
        <section className="demo-city-pattern" aria-labelledby="city-pattern-title">
          <div className="demo-city-pattern__lead">
            <p className="home-section-kicker">Your Dubai</p>
            <h2 id="city-pattern-title">{stats.areas[0].name} is {stats.areas[0].share}% of your city.</h2>
            <p>Counted from the {stats.total} {stats.total === 1 ? "visit" : "visits"} in your log.</p>
          </div>
          <div className="demo-area-list">
            {stats.areas.slice(0, 5).map((area) => (
              <div key={area.name}>
                <div><span>{area.name}</span><strong>{area.share}%</strong></div>
                <progress value={area.share} max="100" aria-label={`${area.name}, ${area.share}% of visits`} />
                <small>{area.visits} {area.visits === 1 ? "visit" : "visits"}</small>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <p className="demo-empty">Your city pattern appears once you have logged a visit or two.</p>
      )}
      <WrappedRecap
        name={name}
        summary={wrappedSummary}
        unavailable={wrappedUnavailable}
      />
      <nav className="legal-links" aria-label="Legal">
        <a href="/terms">Terms</a>
        <a href="/privacy">Privacy</a>
      </nav>
    </section>
  );
}
