import { BURJ_KHALIFA, labelCandidates, landPath, roadPath, type Project } from "@/lib/basemap";
import type { Keep } from "@/components/map/MapLabels";

// The drawn Dubai under a map: sea, land (the creek and canal are the water
// between them), motorways and the Burj Khalifa's spire. Colours come from
// the --map-* values on .mini-map, so it follows the theme. Its words are
// drawn last, on top, by MapLabels from basemapLabels(). No hooks.
const burjAt = (project: Project, w: number, h: number) => {
  const [x, y] = project(BURJ_KHALIFA.lng, BURJ_KHALIFA.lat);
  return x > 6 && x < w - 6 && y > 20 && y < h - 4 ? { x, y } : null;
};

export default function Basemap({ project, w, h }: { project: Project; w: number; h: number }) {
  const burj = burjAt(project, w, h);
  return (
    <g className="mini-map__base" aria-hidden="true">
      <rect width={w} height={h} className="mini-map__sea" />
      <path d={landPath(project, w, h)} className="mini-map__land" fillRule="evenodd" />
      <path d={roadPath(project, w, h)} className="mini-map__road" />
      {burj && <path d={`M${burj.x - 3.5} ${burj.y} L${burj.x} ${burj.y - 16} L${burj.x + 3.5} ${burj.y} Z`} className="mini-map__landmark" />}
    </g>
  );
}

/** The basemap's names for MapLabels, and the spire they must keep off. */
export function basemapLabels(project: Project, w: number, h: number) {
  const burj = burjAt(project, w, h);
  const keep: Keep[] = burj ? [{ x: burj.x, y: burj.y - 8, r: 9 }] : [];
  return { candidates: labelCandidates(project, w, h).filter((l) => !l.landmark || burj), keep };
}
