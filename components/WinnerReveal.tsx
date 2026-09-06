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
 * SPECS.md §14.2: one-shot particle reconstruction, scoped to the decided-
 * plan reveal only. This IS the reveal, not decoration layered on top of
 * one — see the spec's own line for why that keeps it clear of the
 * no-confetti rule. Hand-rolled canvas, not a library, not reusable
 * infrastructure: one effect, one place.
 *
 * Was WinnerPhotoReveal, and it sampled the winner's PHOTO. That gated the
 * app's most emotional moment on `photo_url`, which is set for 6 of 82
 * spots — so the reveal ran for 7% of plans, and until photos landed at
 * all, for none. It also had to carry a canvas-taint fallback, because
 * `getImageData()` throws on a cross-origin image with no CORS header and
 * photo_url is an unproven host.
 *
 * Now it reconstructs the winner's NAME instead. Every plan has a name, so
 * the reveal runs every time, and the pixels are drawn locally with
 * fillText, so the canvas can never be tainted and that whole fallback is
 * gone. Less code, more coverage.
 *
 * Two fallbacks remain, both real: prefers-reduced-motion renders the
 * settled state directly, and so does a missing 2D context.
 */

const WIDTH = 400;
const HEIGHT = 220;
// 2px cells, where the photo version used 7. Type covers a fraction of the
// box a full-bleed photo did, so 7 gave 45-87 particles for real venue
// names — scattered dots that never resolved into a word. Measured across
// real catalogue names at 2px cells and a 96px ceiling: 776 ("Museum of
// the Future", which shrinks to 38px to fit) to 1,232 ("Brasserie 2.0" at
// 70px). Under the 1,500-2,500 the spec caps at, and ~1,000 fillRects a
// frame is nothing.
const CELL = 2;
const DURATION_MS = 1100;
const MAX_FONT = 96;
const MIN_FONT = 26;
const SIDE_PADDING = 28;

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

/**
 * Largest size at which `text` fits one line, down to MIN_FONT. Below that
 * the name is left to overflow its own measurement rather than shrinking
 * into illegibility — a venue whose name cannot fit is better clipped than
 * rendered at a size nobody can read.
 */
function fitFontSize(ctx: CanvasRenderingContext2D, text: string, family: string): number {
  const available = WIDTH - SIDE_PADDING * 2;
  for (let size = MAX_FONT; size > MIN_FONT; size -= 2) {
    ctx.font = `800 ${size}px ${family}`;
    if (ctx.measureText(text).width <= available) return size;
  }
  return MIN_FONT;
}

export default function WinnerReveal({
  name,
  photoUrl,
  alt,
}: {
  name: string;
  /** Optional. When present the reveal settles onto the photo, as before. */
  photoUrl?: string | null;
  alt: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<"particles" | "settled">("particles");
  // The size the name was actually reconstructed at, so the crisp text
  // that replaces the canvas is the same size and the settle does not
  // jump. Expressed in cqw because the canvas is drawn in a 400px space
  // and then scaled to the container by CSS.
  const [fittedPx, setFittedPx] = useState<number | null>(null);
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotion,
    getReducedMotionServerSnapshot,
  );

  useEffect(() => {
    if (reducedMotion) return; // settled state renders directly, nothing to animate
    let cancelled = false;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      setPhase("settled");
      return;
    }

    // Family and colour come from the canvas's own computed style, so the
    // reveal uses the display face and the ink of whatever ground it is on
    // without this file naming either. That is what keeps it correct when
    // the palette changes underneath it.
    const computed = getComputedStyle(canvas);
    const family = computed.fontFamily || "serif";
    const ink = computed.color || "#000";

    const run = () => {
      if (cancelled) return;
      const sample = document.createElement("canvas");
      sample.width = WIDTH;
      sample.height = HEIGHT;
      const sctx = sample.getContext("2d");
      if (!sctx) {
        setPhase("settled");
        return;
      }

      // Left transparent on purpose: only the glyphs get sampled below, so
      // the particle cloud is the shape of the name rather than a solid
      // rectangle of background cells.
      const size = fitFontSize(sctx, name, family);
      setFittedPx(size);
      sctx.font = `800 ${size}px ${family}`;
      sctx.fillStyle = ink;
      sctx.textAlign = "center";
      sctx.textBaseline = "middle";
      sctx.fillText(name, WIDTH / 2, HEIGHT / 2, WIDTH - SIDE_PADDING * 2);

      const pixels = sctx.getImageData(0, 0, WIDTH, HEIGHT); // local pixels: cannot taint
      const particles: Particle[] = [];
      for (let gy = 0; gy < HEIGHT; gy += CELL) {
        for (let gx = 0; gx < WIDTH; gx += CELL) {
          const i = (gy * WIDTH + gx) * 4;
          const a = pixels.data[i + 3];
          if (a < 16) continue; // outside the glyphs
          const [r, g, b] = [pixels.data[i], pixels.data[i + 1], pixels.data[i + 2]];
          particles.push({
            sx: Math.random() * WIDTH,
            sy: Math.random() * HEIGHT,
            tx: gx,
            ty: gy,
            color: `rgba(${r}, ${g}, ${b}, ${a / 255})`,
          });
        }
      }

      // A name too thin to sample (or an empty one) would animate nothing
      // for 1.1s and look broken. Settle immediately instead.
      if (!particles.length) {
        setPhase("settled");
        return;
      }

      const start = performance.now();
      const frame = (now: number) => {
        if (cancelled) return;
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
        if (t < 1) window.requestAnimationFrame(frame);
        else setPhase("settled");
      };
      window.requestAnimationFrame(frame);
    };

    // Wait for the display face. Sampling before it loads reconstructs the
    // fallback serif and then swaps to a different shape on settle, which
    // reads as a glitch on the one screen that should not have one.
    if (!document.fonts) run();
    else if (document.fonts.status === "loaded") run();
    else void document.fonts.ready.then(run);

    return () => { cancelled = true; };
  }, [name, reducedMotion]);

  const showCanvas = !reducedMotion && phase === "particles";

  return (
    <div className="winner-reveal">
      {showCanvas && (
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          className="winner-reveal__canvas"
          aria-hidden="true"
        />
      )}
      {!showCanvas &&
        (photoUrl ? (
          <Image
            src={photoUrl}
            alt={alt}
            width={WIDTH}
            height={HEIGHT}
            className="winner-reveal__img"
            // Same posture as PhotoTile/the place hero: photo_url is
            // unconstrained today, next.config has no remotePatterns.
            unoptimized
          />
        ) : (
          <p
            className="winner-reveal__name"
            style={fittedPx ? { fontSize: `${fittedPx / 4}cqw` } : undefined}
          >
            {name}
          </p>
        ))}
    </div>
  );
}
