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
const display = localFont({
  src: [
    {
      path: "../public/fonts/newsreader-variable-latin.woff2",
      weight: "200 800",
      style: "normal",
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
    { media: "(prefers-color-scheme: light)", color: "#f4f0ea" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0c0e" },
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
  const ground = autoGround();

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
