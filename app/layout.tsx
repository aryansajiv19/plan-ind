import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const display = localFont({
  src: [
    { path: "../public/fonts/manrope-500.ttf", weight: "500" },
    { path: "../public/fonts/manrope-600.ttf", weight: "600" },
    { path: "../public/fonts/manrope-700.ttf", weight: "700" },
    { path: "../public/fonts/manrope-800.ttf", weight: "800" },
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
    { media: "(prefers-color-scheme: light)", color: "#f3f1ec" },
    { media: "(prefers-color-scheme: dark)", color: "#090b0e" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${hanken.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">
        <div className="relative z-10 flex flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
