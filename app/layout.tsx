import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import ThemeSync from "@/components/ThemeSync";
import { autoGround } from "@/lib/dubai-phase";
import "./globals.css";

// Archivo, variable: weight 100-900 and width 62-125%. One family carries
// the whole magazine: extra-condensed black for the cover voice, normal width
// for listings, tabular numerals for AED, minutes and km. The width range is
// declared so `font-stretch` selects the drawn widths instead of a synthetic
// squash.
const archivo = localFont({
  src: "../public/fonts/archivo-variable-latin.woff2",
  weight: "100 900",
  style: "normal",
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
  variable: "--font-archivo",
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
      className={`${archivo.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeSync serverGround={ground} />
        <div className="relative z-10 flex flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
