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
 * SPECS.md §14.2 / §25: the winner assembling from scattered particles.
 *
 * THE CANVAS IS THE TRANSITION; THE REAL TEXT IS THE DESTINATION. That
 * ordering is the design, and it is what fixes the app's blurriest pixels:
 * the canvas draws into a fixed 400x220 backing store and CSS stretches it
 * to the panel, which on a retina phone is roughly a 5x upscale — the
 * winner's name rasterised at under a fifth of real screen resolution, on
 * the single moment the product exists to deliver. Soft pixels are fine
 * for 1.1 seconds of motion and not fine as the thing left on screen.
 *
 * So the heading below is ALWAYS in the DOM. It is what the particles land
 * on, it is sharp at any density, it is selectable, and it is a real
 * heading in the accessibility tree rather than a canvas wearing an
 * aria-label.
 *
 * Do NOT "fix" the blur by enlarging the backing store. The sampling grid
 * has to stay 400x220 or the particle count blows §14.2's cap roughly
 * tenfold — the density finding that sized these cells, running backwards.
 * The canvas samples at whatever size lands it on the heading, so the two
 * agree without either growing.
 *
 * Was WinnerPhotoReveal, and it sampled the winner's PHOTO. That gated the
 * app's most emotional moment on `photo_url`, set for 6 of 82 spots, so it
 * ran for 7% of plans. It also needed a canvas-taint fallback, because
 * getImageData() throws on a cross-origin image. Sampling locally-drawn
 * text deleted that whole branch.
 */

const WIDTH = 400;
const HEIGHT = 220;
// 2px cells, where the photo version used 7. Type covers a fraction of the
// box a full-bleed photo did, so 7 gave 45-87 particles for real venue
// names — scattered dots that never resolved into a word. Measured across
// real catalogue names: 776 ("Museum of the Future") to 1,232 ("Brasserie
// 2.0"), under the 1,500-2,500 §14.2 caps at, and ~1,000 fillRects a frame
// is nothing.
const CELL = 2;
// A short name sampled at CELL 2 lands around 230-280 particles — measured
// "3Fils" at 280 on a phone and 228 on desktop — because §25's clamp sizes
// the heading to the viewport rather than scaling it up to fill the panel,
// so a five-letter word covers a fraction of the glyph area a long one
// does. Long names are unaffected (772-1142). Below this floor the cloud
// reads as scattered dots rather than a word assembling, which is the exact
// failure the 7px cell had. Re-sampling those at CELL 1 restores them to
// ~900-1,100 without touching the 400x220 grid, which must not grow.
const MIN_PARTICLES = 500;
const DURATION_MS = 1100;
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

export default function WinnerReveal({
  name,
  photoUrl,
  alt,
}: {
  name: string;
  photoUrl?: string | null;
  alt: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [phase, setPhase] = useState<"particles" | "settled">("particles");
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotion,
    getReducedMotionServerSnapshot,
  );

  useEffect(() => {
    if (reducedMotion) return; // the heading is already the rendered state
    let cancelled = false;
    const canvas = canvasRef.current;
    const heading = headingRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !heading || !ctx) {
      setPhase("settled");
      return;
    }

    // The swap is on a TIMER, not on the animation finishing. A backgrounded
    // tab stops firing requestAnimationFrame, so a swap living in the rAF
    // callback never runs there and the user comes back to a canvas frozen
    // mid-flight — the winner's name as a permanent blurry bitmap. setTimeout
    // is throttled in a background tab but it does fire. The loop below stops
    // drawing when this lands; it does not decide when that is.
    const settle = window.setTimeout(() => {
      if (!cancelled) setPhase("settled");
    }, DURATION_MS + 60);

    const run = () => {
      if (cancelled) return;

      // Sample at the size the HEADING actually renders at, converted into
      // the 400x220 space. That lands the particles ON the destination
      // rather than near it, so the swap is invisible instead of a jump —
      // and it keeps the backing store fixed while the reveal still scales
      // with the panel.
      const panel = canvas.getBoundingClientRect();
      const scale = panel.width > 0 ? WIDTH / panel.width : 1;
      const headingStyle = getComputedStyle(heading);
      const fontPx = parseFloat(headingStyle.fontSize) * scale;
      const family = headingStyle.fontFamily || "serif";
      const weight = headingStyle.fontWeight || "800";
      const ink = headingStyle.color || "#fff";

      const sample = document.createElement("canvas");
      sample.width = WIDTH;
      sample.height = HEIGHT;
      const sctx = sample.getContext("2d");
      if (!sctx) {
        setPhase("settled");
        return;
      }

      // Left transparent on purpose: only glyphs get sampled below, so the
      // particle cloud is the shape of the name rather than a solid
      // rectangle of background cells.
      sctx.font = `${weight} ${fontPx}px ${family}`;
      sctx.fillStyle = ink;
      sctx.textAlign = "center";
      sctx.textBaseline = "middle";
      sctx.fillText(name, WIDTH / 2, HEIGHT / 2, WIDTH - SIDE_PADDING * 2);

      const pixels = sctx.getImageData(0, 0, WIDTH, HEIGHT); // local pixels: cannot taint
      const sampleAt = (cell: number): Particle[] => {
        const out: Particle[] = [];
        for (let gy = 0; gy < HEIGHT; gy += cell) {
          for (let gx = 0; gx < WIDTH; gx += cell) {
            const i = (gy * WIDTH + gx) * 4;
            const a = pixels.data[i + 3];
            if (a < 16) continue; // outside the glyphs
            out.push({
              sx: Math.random() * WIDTH,
              sy: Math.random() * HEIGHT,
              tx: gx,
              ty: gy,
              color: `rgba(${pixels.data[i]}, ${pixels.data[i + 1]}, ${pixels.data[i + 2]}, ${a / 255})`,
            });
          }
        }
        return out;
      };
      // Track the cell that was actually used. Deriving it back from the
      // particle count does not work: after the second pass the count is
      // above the floor by construction, so the check would report the cell
      // it just moved away from.
      let cell = CELL;
      let particles = sampleAt(cell);
      // Second pass only for the short names that need it. Two walks of one
      // 400x220 buffer, once, before any frame is drawn.
      if (particles.length < MIN_PARTICLES) {
        cell = 1;
        particles = sampleAt(cell);
      }

      // A name too thin to sample would animate nothing for 1.1s and look
      // broken. Settle immediately instead.
      if (!particles.length) {
        setPhase("settled");
        return;
      }

      // Drawn at the cell it was sampled at — a re-sampled cloud painted with
      // 2px blocks on a 1px lattice would thicken into a slab.
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
            cell,
            cell,
          );
        }
        if (t < 1) window.requestAnimationFrame(frame);
      };
      window.requestAnimationFrame(frame);
    };

    // Wait for the display face. Sampling before it loads reconstructs the
    // fallback serif and then settles onto a different shape, which reads as
    // a glitch on the one screen that should not have one.
    if (!document.fonts) run();
    else if (document.fonts.status === "loaded") run();
    else void document.fonts.ready.then(run);

    return () => {
      cancelled = true;
      window.clearTimeout(settle);
    };
  }, [name, reducedMotion]);

  const showCanvas = !reducedMotion && phase === "particles";

  return (
    <div className="winner-reveal" data-photo={photoUrl ? "true" : undefined}>
      {photoUrl && (
        <>
          <Image
            src={photoUrl}
            alt={alt}
            fill
            sizes="(max-width: 700px) 100vw, 40rem"
            className="winner-reveal__img"
            // Same posture as PhotoTile and the place hero: photo_url is
            // unconstrained today and next.config has no remotePatterns, so
            // the optimiser is never pointed at an unproven origin.
            unoptimized
          />
          {/* The scrim/ink pair .place-hero uses. Those tokens keep their
              night values on both grounds on purpose — a headline that flips
              to dark ink on a photograph disappears. */}
          <div className="winner-reveal__scrim" aria-hidden="true" />
        </>
      )}
      {/* Always rendered: the destination, the measurement target for the
          sampling above, and the winner's name in the accessibility tree.
          Hidden from view — not from layout — while the particles run. */}
      <h2
        ref={headingRef}
        className="winner-reveal__name"
        data-hidden={showCanvas || undefined}
      >
        {name}
      </h2>
      {showCanvas && (
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          className="winner-reveal__canvas"
          aria-hidden="true"
        />
      )}
    </div>
  );
}
