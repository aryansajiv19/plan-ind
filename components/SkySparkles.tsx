// A few four-point glints over the night sky (base.css): each fades and
// scales in on its own slow cycle, so the page shimmers without ever
// flashing. Server-rendered, no JS; hidden from assistive tech and pointers.
const GLINTS: readonly [top: number, left: number, size: number, delay: number, gold: boolean][] = [
  [8, 12, 14, 0, true], [18, 78, 11, 2.4, false], [31, 44, 10, 5.1, true],
  [42, 91, 13, 1.2, true], [57, 6, 12, 3.8, false], [66, 63, 10, 6.6, true],
  [74, 27, 14, 0.7, false], [85, 84, 11, 4.5, true], [93, 49, 12, 7.9, false],
  [25, 58, 9, 8.8, true],
];

export default function SkySparkles() {
  return (
    <div className="sky-sparkles" aria-hidden="true">
      {GLINTS.map(([top, left, size, delay, gold]) => (
        <span
          key={`${top}-${left}`}
          className={gold ? "sky-sparkles__glint sky-sparkles__glint--gold" : "sky-sparkles__glint"}
          style={{ top: `${top}%`, left: `${left}%`, width: size, height: size, animationDelay: `${delay}s` }}
        />
      ))}
    </div>
  );
}
