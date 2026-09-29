// The night sky's stars (base.css): round points, not shapes. Brightness
// follows a real sky — many faint, a few bright — with a slight colour
// temperature (warm, white, cool). The brighter ones scintillate: small,
// irregular flickers in brightness on their own rhythm; faint ones hold
// still. Nothing moves, spins or grows. Positions come from a fixed seed, so
// the server and browser agree. Server-rendered, no JS; hidden from
// assistive tech and pointers.
import type { CSSProperties } from "react";

const COUNT = 110;
const TINTS = ["#fdfbf7", "#fdfbf7", "#ffe6c7", "#dde5f5"]; // white, white, warm, cool

function seeded(seed: number) {
  let t = seed;
  return () => {
    t = (t * 1664525 + 1013904223) % 4294967296;
    return t / 4294967296;
  };
}

const rand = seeded(29);
const STARS = Array.from({ length: COUNT }, () => {
  const magnitude = rand() ** 3; // skewed: most stars faint, a few bright
  return {
    top: rand() * 100,
    left: rand() * 100,
    size: 1 + magnitude * 1.8,
    brightness: 0.3 + magnitude * 0.7,
    tint: TINTS[Math.floor(rand() * TINTS.length)],
    twinkles: magnitude > 0.08,
    duration: 1.8 + rand() * 3.4,
    delay: -rand() * 5, // mid-cycle from the first frame
  };
});

export default function SkySparkles() {
  return (
    <div className="sky-sparkles" aria-hidden="true">
      {STARS.map((star, i) => (
        <span
          key={i}
          className={`sky-sparkles__star${star.twinkles ? " sky-sparkles__star--twinkle" : ""}`}
          style={
            {
              top: `${star.top.toFixed(2)}%`,
              left: `${star.left.toFixed(2)}%`,
              width: `${star.size.toFixed(2)}px`,
              height: `${star.size.toFixed(2)}px`,
              "--b": star.brightness.toFixed(2),
              "--tint": star.tint,
              animationDuration: `${star.duration.toFixed(2)}s`,
              animationDelay: `${star.delay.toFixed(2)}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
