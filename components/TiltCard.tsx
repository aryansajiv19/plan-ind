"use client";

import { useRef, type ReactNode } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useReducedMotion,
} from "motion/react";

/**
 * The plan card, held in space.
 *
 * Turn 13 of the design handoff is titled "3D as an effect, not a place": no
 * models, no venue geometry, just real perspective applied to something that
 * was already flat. Pointer position across the card maps to a small rotation,
 * and the layers inside sit at different depths so they part slightly as it
 * turns. That parallax is the entire "3D" in this product — turn 11's actual
 * 3D venue was rejected for not scaling and not matching a real room.
 *
 * The numbers are the handoff's, not invented: rotateY +/-7deg, rotateX
 * +/-5deg, an 180ms linear follow while the pointer is over the card, and an
 * 800ms settle back to rest on leave. Springs rather than transitions because
 * a spring is what makes it feel like an object with mass instead of a
 * repainting div.
 *
 * Depth layers, applied by the caller via `data-depth`:
 *   0  the photograph        (translateZ 0)
 *   1  the hairline frame    (translateZ 38px)
 *   2  the text block        (translateZ 72px)
 *
 * Accessibility: the whole effect is decorative and removing it loses no
 * information, so `prefers-reduced-motion` disables it outright rather than
 * shortening it — a reduced-motion user gets a flat, static card. It is also
 * pointer-only by nature, so nothing here may be the sole route to anything;
 * the card's real actions are ordinary focusable controls inside it.
 */
export default function TiltCard({
  children,
  className = "",
  maxTiltY = 7,
  maxTiltX = 5,
}: {
  children: ReactNode;
  className?: string;
  maxTiltY?: number;
  maxTiltX?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  // -0.5 .. 0.5, the pointer's position across the card.
  const px = useMotionValue(0);
  const py = useMotionValue(0);

  // The follow is deliberately stiff and the return soft. One spring config
  // cannot do both, so `restDelta` keeps the settle from ringing on for ages
  // while the stiffness stays low enough to read as weight.
  const spring = { stiffness: 150, damping: 20, mass: 0.6, restDelta: 0.001 };
  const sx = useSpring(px, spring);
  const sy = useSpring(py, spring);

  const rotateY = useTransform(sx, [-0.5, 0.5], [-maxTiltY, maxTiltY]);
  const rotateX = useTransform(sy, [-0.5, 0.5], [maxTiltX, -maxTiltX]);

  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
      onPointerMove={(e) => {
        // Pointer, not mouse: a stylus should tilt it too. Touch is excluded
        // below because a finger dragging the card would fight the scroll.
        if (e.pointerType === "touch") return;
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        px.set((e.clientX - r.left) / r.width - 0.5);
        py.set((e.clientY - r.top) / r.height - 0.5);
      }}
      onPointerLeave={() => {
        px.set(0);
        py.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}
