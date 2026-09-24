/**
 * The shared frame for both generated share images (app/opengraph-image.tsx
 * and app/plan/[id]/opengraph-image.tsx). `_og` is a private folder: nothing
 * here is a route.
 *
 * Night palette, copied from app/globals.css's dark ground because ImageResponse
 * (Satori) cannot read CSS variables. Change them there, change them here.
 * Fonts: Satori reads TTF/OTF/WOFF, not WOFF2, so Cormorant ships as two static
 * Latin instances cut from the site's own variable files (roman 500 for the
 * title, italic 600 for the one emphasised phrase, as .home-title does).
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReactNode } from "react";

export const OG_SIZE = { width: 1200, height: 630 };

export const NIGHT = {
  paper: "#051822", // canvas
  card: "#0b2836",
  ink: "#d4c9c7", // 7.43 on canvas
  muted: "#969a9e",
  punch: "#aa7452", // tan: fill and rule only, never text
  punchText: "#bf977d", // 4.54 on canvas
};

const font = (file: string) => readFile(join(process.cwd(), "public/fonts", file));

export async function ogFonts() {
  const [roman, italic, body, bodyBold] = await Promise.all([
    font("cormorant-500-latin.ttf"),
    font("cormorant-italic-600-latin.ttf"),
    font("hanken-grotesk-500.ttf"),
    font("hanken-grotesk-700.ttf"),
  ]);
  return [
    { name: "Cormorant", data: roman, weight: 500 as const, style: "normal" as const },
    { name: "Cormorant", data: italic, weight: 600 as const, style: "italic" as const },
    { name: "Hanken", data: body, weight: 500 as const, style: "normal" as const },
    { name: "Hanken", data: bodyBold, weight: 700 as const, style: "normal" as const },
  ];
}

/** The D/03 badge from the front-door nav, at share-card scale. */
function Mark() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 76,
        height: 76,
        borderRadius: 16,
        background: NIGHT.ink,
        color: NIGHT.paper,
        fontFamily: "Hanken",
        fontWeight: 700,
        fontSize: 26,
        letterSpacing: -1,
      }}
    >
      <span>D/</span>
      <span style={{ fontSize: 22, marginTop: 2 }}>03</span>
    </div>
  );
}

export function OgFrame({ kicker, children, footer }: { kicker: string; children: ReactNode; footer: string }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px 76px",
        background: NIGHT.paper,
        color: NIGHT.ink,
        fontFamily: "Hanken",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <Mark />
        <div
          style={{
            display: "flex",
            fontSize: 24,
            fontWeight: 500,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: NIGHT.punchText,
          }}
        >
          {kicker}
        </div>
      </div>
      {children}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderTop: `2px solid ${NIGHT.punch}`,
          paddingTop: 26,
          fontSize: 26,
          fontWeight: 500,
          color: NIGHT.muted,
        }}
      >
        <span>{footer}</span>
        <span style={{ color: NIGHT.ink, fontWeight: 700 }}>Deal three</span>
      </div>
    </div>
  );
}
