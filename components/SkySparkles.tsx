// Continuous sparkle over the night sky (base.css): four-point glints,
// each on its own rhythm (length, delay, size and a slow drift differ), so
// some are always catching the light and the page never goes still.
// Positions come from a fixed seed, so the server and browser agree.
// Server-rendered, no JS; hidden from assistive tech and pointers.
const COUNT = 44;

function seeded(seed: number) {
  let t = seed;
  return () => {
    t = (t * 1664525 + 1013904223) % 4294967296;
    return t / 4294967296;
  };
}

const rand = seeded(29);
const GLINTS = Array.from({ length: COUNT }, (_, i) => ({
  top: rand() * 100,
  left: rand() * 100,
  size: 4 + Math.round(rand() * 10),
  duration: 3 + rand() * 4,
  delay: -rand() * 7, // negative: mid-cycle from the first frame, never all dark
  gold: i % 3 !== 0,
  drift: i % 5 === 0,
}));

export default function SkySparkles() {
  return (
    <div className="sky-sparkles" aria-hidden="true">
      {GLINTS.map((glint, i) => (
        <span
          key={i}
          className={`sky-sparkles__glint${glint.gold ? " sky-sparkles__glint--gold" : ""}${glint.drift ? " sky-sparkles__glint--drift" : ""}`}
          style={{
            top: `${glint.top.toFixed(2)}%`,
            left: `${glint.left.toFixed(2)}%`,
            width: glint.size,
            height: glint.size,
            animationDuration: `${glint.duration.toFixed(2)}s`,
            animationDelay: `${glint.delay.toFixed(2)}s`,
          }}
        />
      ))}
    </div>
  );
}
