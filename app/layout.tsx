import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import ThemeSync from "@/components/ThemeSync";
import { autoGround } from "@/lib/dubai-phase";
import "./globals.css";

// Cormorant (display: hero, titles) with a real italic src, so
// `font-style: italic` gets the drawn face, not a synthetic slant.
// Hanken Grotesk carries body, labels, chips and numerals.
const display = localFont({
  src: [
    { path: "../public/fonts/cormorant-variable-latin.woff2", weight: "300 700", style: "normal" },
    { path: "../public/fonts/cormorant-italic-variable-latin.woff2", weight: "300 700", style: "italic" },
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

const DESCRIPTION = "Stop deciding, start doing. Pick a vibe, deal three spots, vote, let the app call it.";

export const metadata: Metadata = {
  // Absolute og:image URLs need a base. Unset, Next falls back to the Vercel
  // deployment URL (or localhost in dev), so a missing env costs nothing here.
  metadataBase: process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL) : undefined,
  title: "Deal three | Dubai hangout decider",
  description: DESCRIPTION,
  // The unfurl a pasted link gets in WhatsApp/iMessage/Slack. The image is
  // app/opengraph-image.tsx; app/plan/[id]/layout.tsx replaces all of this
  // per plan (openGraph merges shallowly, so it restates siteName/type).
  openGraph: {
    type: "website",
    siteName: "Deal three",
    locale: "en_AE",
    title: "Dubai plans, without the group chat.",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Dubai plans, without the group chat.",
    description: DESCRIPTION,
  },
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
    { media: "(prefers-color-scheme: light)", color: "#f5f1ec" },
    { media: "(prefers-color-scheme: dark)", color: "#0f2a36" },
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
