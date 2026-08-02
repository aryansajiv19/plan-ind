"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

export interface ConfettiHandle {
  // Fire a burst at (x, y) in CSS pixels relative to the canvas.
  burst: (x: number, y: number) => void;
}

const COLORS = ["#ff2e88", "#ffce2e", "#6b34e0", "#17c79a"];

// A full-bleed canvas that fires a one-shot confetti burst on demand.
// Decorative, so it self-disables under reduced-motion (design floor).
const ConfettiCanvas = forwardRef<ConfettiHandle>(function ConfettiCanvas(
  _props,
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }, []);

  useImperativeHandle(ref, () => ({
    burst(x, y) {
      const reduce = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      if (reduce) return;
      const ctx = sizeCanvas();
      const canvas = canvasRef.current;
      if (!ctx || !canvas) return;

      const parts = Array.from({ length: 90 }, (_, i) => {
        const angle = Math.random() * Math.PI * 2;
        const speed = 4 + Math.random() * 7;
        return {
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 6,
          g: 0.28 + Math.random() * 0.15,
          w: 6 + Math.random() * 7,
          h: 4 + Math.random() * 6,
          rot: Math.random() * 6,
          vr: (Math.random() - 0.5) * 0.4,
          color: COLORS[i % COLORS.length],
          life: 60 + Math.random() * 30,
        };
      });

      let frames = 0;
      const rect = canvas.getBoundingClientRect();
      cancelAnimationFrame(rafRef.current);
      const tick = () => {
        ctx.clearRect(0, 0, rect.width, rect.height);
        let alive = false;
        for (const p of parts) {
          if (p.life <= 0) continue;
          alive = true;
          p.life -= 1;
          p.vy += p.g;
          p.x += p.vx;
          p.y += p.vy;
          p.rot += p.vr;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 30));
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          ctx.restore();
        }
        frames += 1;
        if (alive && frames < 160) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          ctx.clearRect(0, 0, rect.width, rect.height);
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    },
  }));

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 h-full w-full"
    />
  );
});

export default ConfettiCanvas;
