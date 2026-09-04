"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";

// Read via useSyncExternalStore, not a plain useEffect + setState: the
// server has no matchMedia, so the client's first render must match its
// own snapshot (false, motion allowed) exactly or React logs a hydration
// mismatch. Setting it from an effect after the fact would work too, but
// trips this repo's react-hooks/set-state-in-effect lint rule for a
// synchronous setState right at the top of the effect body — this avoids
// that class of bug entirely rather than reaching for the guard.
function subscribeReducedMotion(onChange: () => void) {
  const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}
function getReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function getReducedMotionServerSnapshot() {
  return false;
}

/**
 * SPECS.md §14.2: one-shot particle-reconstruction, scoped to the decided-
 * plan reveal only. This IS the reveal, not decoration layered on top of
 * one — see the spec's own line for why that keeps it clear of the
 * no-confetti rule. Hand-rolled canvas, not a library, not reusable
 * infrastructure: one effect, one place.
 *
 * Triggers once on mount, never replays. Falls back to the plain photo
 * (no particle effect, not a crash) in three cases: prefers-reduced-motion,
 * the image fails to load, or the canvas comes back tainted — spot.photo_url
 * is an unproven host with no CORS guarantee, and getImageData() throws on
 * a cross-origin image with no Access-Control-Allow-Origin header. That's
 * expected for most real photo_url values, not a bug to chase.
 */

const WIDTH = 400;
const HEIGHT = 220;
const CELL = 7; // px per particle cell: ~1,770 particles at this size, within the 1,500-2,500 the spec caps at.
const DURATION_MS = 1100;

interface Particle {
  sx: number; sy: number; // scattered start
  tx: number; ty: number; // sampled target
  color: string;
}

// cubic-bezier(0.16, 1, 0.3, 1) (--ease-settle) approximated with
// easeOutCubic — close enough for a coarse particle reveal, and avoids
// pulling in a bezier solver for one effect.
function easeSettle(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export default function WinnerPhotoReveal({ src, alt }: { src: string; alt: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<"particles" | "photo">("particles");
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, getReducedMotionServerSnapshot);

  useEffect(() => {
    if (reducedMotion) return; // rendered as the plain photo directly below, nothing to animate
    let cancelled = false;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      setPhase("photo");
      return;
    }

    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      const sample = document.createElement("canvas");
      sample.width = WIDTH;
      sample.height = HEIGHT;
      const sctx = sample.getContext("2d");
      if (!sctx) {
        setPhase("photo");
        return;
      }
      sctx.drawImage(img, 0, 0, WIDTH, HEIGHT);

      let pixels: ImageData;
      try {
        pixels = sctx.getImageData(0, 0, WIDTH, HEIGHT);
      } catch {
        setPhase("photo");
        return;
      }

      const particles: Particle[] = [];
      for (let gy = 0; gy < HEIGHT; gy += CELL) {
        for (let gx = 0; gx < WIDTH; gx += CELL) {
          const i = (gy * WIDTH + gx) * 4;
          const [r, g, b, a] = [pixels.data[i], pixels.data[i + 1], pixels.data[i + 2], pixels.data[i + 3]];
          if (a < 16) continue; // skip fully-transparent cells
          particles.push({
            sx: Math.random() * WIDTH,
            sy: Math.random() * HEIGHT,
            tx: gx,
            ty: gy,
            color: `rgb(${r}, ${g}, ${b})`,
          });
        }
      }

      const start = performance.now();
      function frame(now: number) {
        if (cancelled || !ctx) return;
        const t = Math.min(1, (now - start) / DURATION_MS);
        const eased = easeSettle(t);
        ctx.clearRect(0, 0, WIDTH, HEIGHT);
        for (const p of particles) {
          ctx.fillStyle = p.color;
          ctx.fillRect(
            p.sx + (p.tx - p.sx) * eased,
            p.sy + (p.ty - p.sy) * eased,
            CELL,
            CELL,
          );
        }
        if (t < 1) {
          window.requestAnimationFrame(frame);
        } else {
          setPhase("photo"); // assembled — swap to the crisp real photo
        }
      }
      window.requestAnimationFrame(frame);
    };
    img.onerror = () => setPhase("photo");
    img.src = src;

    return () => { cancelled = true; };
  }, [src, reducedMotion]);

  const showCanvas = !reducedMotion && phase === "particles";

  return (
    <div className="winner-photo-reveal">
      {showCanvas && (
        <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} className="winner-photo-reveal__canvas" aria-hidden="true" />
      )}
      {!showCanvas && (
        <Image
          src={src}
          alt={alt}
          width={WIDTH}
          height={HEIGHT}
          className="winner-photo-reveal__img"
          // Same posture as PhotoTile/the place hero: photo_url is
          // unconstrained today, next.config has no remotePatterns.
          unoptimized
        />
      )}
    </div>
  );
}
