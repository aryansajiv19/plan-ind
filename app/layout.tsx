import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import ThemeSync from "@/components/ThemeSync";
import { autoGround } from "@/lib/dubai-phase";
import "./globals.css";

// Newsreader, variable, wght 200-800.
//
// The handoff specified Manrope for display. This is a deliberate departure,
// taken on the owner's call after Cobble came in as a reference for "the
// nature of the design": nearly all of that reference's character comes from
// pairing an editorial serif with a friendly sans, and a geometric sans on
// warm sand reads generic next to it. A high-contrast serif with air is also
// the sleekest thing available — the two briefs do not actually conflict.
//
// Newsreader specifically: its 200-800 axis is exactly the range the handoff
// asked for, so turn 13's headline entrance (weight 300 -> 800 over 1.4s)
// transfers unchanged; it carries an optical-size axis; and it is neither
// Playfair nor Fraunces, both of which are everywhere.
//
// DISPLAY ONLY — hero, titles, section heads, the wordmark. Body copy,
// labels, chips and numerals stay Hanken Grotesk. Two families, which is the
// cap FRONTEND_DESIGN_STANDARDS sets.
// Cormorant, variable, wght 300-700, roman AND italic.
//
// The italic is a SECOND SRC ENTRY on the same family, not a second
// localFont() call and not hand-rolled @font-face — that is what makes
// `font-style: italic` resolve to the real drawn face. SPECS.md §20.1 is
// about exactly this: with only a roman registered, `font-style: italic`
// yields a browser-synthesised oblique, the roman letterforms mechanically
// slanted. That is the cheap-looking version of the effect the owner asked
// for, so shipping it would defeat the instruction rather than satisfy it.
//
// Replaces Newsreader as the display face (owner's choice). Newsreader is
// no longer loaded: nothing references it once --font-display-family points
// here, and leaving it registered would ship 131KB of unused font on every
// page. The file stays in public/fonts if it is ever wanted back.
//
// Cormorant's axis is 300-700, narrower than Newsreader's 200-800 — see
// WeightRise, whose entrance range is narrowed to match rather than being
// left to clamp silently at the top.
const display = localFont({
  src: [
    {
      path: "../public/fonts/cormorant-variable-latin.woff2",
      weight: "300 700",
      style: "normal",
    },
    {
      path: "../public/fonts/cormorant-italic-variable-latin.woff2",
      weight: "300 700",
      style: "italic",
    },
  ],
  variable: "--font-display-family",
  display: "swap",
});

const hanken = localFont({
  src: [
    { path: "../public/fonts/hanken-grotesk-400.ttf", weight: "400" },
    { path: "../public/fonts/hanken-grotesk-500.ttf", weight: "500" },
    { path: "../public/fonts/hanken-grotesk-700.ttf", weight: "700" },
  ],
  variable: "--font-hanken",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Deal three | Dubai hangout decider",
  description: "Stop deciding, start doing. Pick a vibe, deal three spots, vote, let the app call it.",
  manifest: "/manifest.webmanifest",
  applicationName: "Deal three",
  appleWebApp: {
    // Installed from the home screen this runs without browser chrome, which
    // is what makes the fixed tab bar read as a tab bar and not a sticky div.
    capable: true,
    title: "Deal three",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  // interactiveWidget keeps the fixed tab bar above the software keyboard
  // instead of letting it be pushed off-screen while someone types a name.
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1117" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Stamped server-side so the first paint is already the right ground —
  // the Dubai clock is server-knowable, and a sand-to-black flash on every
  // evening load is exactly the kind of thing a themed product cannot do.
  // ThemeSync then applies any stored override and handles the 17:00 turnover.
  //
  // PARKED 2026-09-07 (owner: "Keep light mode in the dark for now. Hold
  // it back."). Light's values are intact and correct; only the path that
  // selects them is disabled. This is §19.2's park run in the opposite
  // direction — dark is now the identity (SPECS.md §23) and light is the
  // one held back. The clock itself is deliberately left alone and still
  // called below: it is its APPLICATION that is parked, so
  // lib/dubai-phase.ts stays correct and testable.
  //
  // NOTE: the ground is pinned in TWO places — here (server stamp, first
  // paint) and components/ThemeSync.tsx (client re-resolve, including a
  // 60s interval). Restoring one without the other half-restores light,
  // and because light is what the whole app used to render, getting this
  // wrong flips the app between two complete identities on a 60-second
  // cycle rather than merely showing the wrong one.
  //
  // To restore: return `autoGround()` here, unpin ThemeSync, and bring
  // back the nav toggle in components/HomeExperience.tsx. See §23.8.
  void autoGround();
  const ground = "night";

  return (
    <html
      lang="en"
      data-theme={ground}
      className={`${display.variable} ${hanken.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeSync serverGround={ground} />
        <div className="relative z-10 flex flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
