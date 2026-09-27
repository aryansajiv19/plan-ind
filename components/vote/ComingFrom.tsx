import { DUBAI_ORIGINS } from "@/lib/dubai-areas";
import type { ViewerOrigin } from "@/hooks/use-viewer-origin";

// P18: "You're coming from", for this voter's own distance and drive on the
// cards. Stays in this browser (see useViewerOrigin).
export default function ComingFrom({ viewer }: { viewer: ViewerOrigin }) {
  return (
    <div className="coming-from">
      <label>
        <span>You’re coming from</span>
        <select value={viewer.selected} onChange={(event) => viewer.choose(event.target.value)} disabled={viewer.locating}>
          <option value="">Choose, to see your own distance</option>
          <option value="device">{viewer.locating ? "Finding you…" : "My location"}</option>
          {DUBAI_ORIGINS.filter((option) => option.coordinates).map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      {viewer.geoError && <p role="alert">{viewer.geoError}</p>}
    </div>
  );
}
