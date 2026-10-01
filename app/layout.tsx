import type { Metadata, Viewport } from "next";
import ThemeSync from "@/components/ThemeSync";
import { cookies } from "next/headers";
import { THEME_COOKIE, readPreference, resolveGround } from "@/lib/dubai-phase";
import "./globals.css";

const DESCRIPTION = "Stop deciding, start doing. Pick a vibe, deal three spots, vote, let the app call it.";

export const metadata: Metadata = {
  // Absolute og:image URLs need a base. Unset, Next falls back to the Vercel
  // deployment URL (or localhost in dev), so a missing env costs nothing here.
  metadataBase: process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL) : undefined,
  title: "Planind | Dubai hangout decider",
  description: DESCRIPTION,
  // The unfurl a pasted link gets in WhatsApp/iMessage/Slack. The image is
  // app/opengraph-image.tsx; app/plan/[id]/layout.tsx replaces all of this
  // per plan (openGraph merges shallowly, so it restates siteName/type).
  openGraph: {
    type: "website",
    siteName: "Planind",
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
  applicationName: "Planind",
  appleWebApp: {
    // Installed from the home screen this runs without browser chrome, which
    // is what makes the fixed tab bar read as a tab bar and not a sticky div.
    capable: true,
    title: "Planind",
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Stamped server-side so the first paint is already the right ground: the
  // Dubai clock (day until 17:00) unless a ground was chosen with the nav
  // toggle, which lives in a cookie for exactly this reason. ThemeSync then
  // handles the 17:00 turnover for a tab left open.
  const ground = resolveGround(readPreference((await cookies()).get(THEME_COOKIE)?.value));

  return (
    <html
      lang="en"
      data-theme={ground}
      className="h-full"
    >
      <body className="min-h-full flex flex-col">
        <ThemeSync serverGround={ground} />
        <div className="relative z-10 flex flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
