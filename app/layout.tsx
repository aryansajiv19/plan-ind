import type { Metadata } from "next";
import { Hanken_Grotesk, Manrope } from "next/font/google";
import SkylineBackdrop from "@/components/SkylineBackdrop";
import "./globals.css";

// Display face — precise and architectural, with enough warmth for hospitality.
const bricolage = Manrope({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

// Body face — a clean, friendly workhorse that stays quiet under the display.
const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Deal three — Dubai hangout decider",
  description: "Stop deciding, start doing. Pick a vibe, deal three spots, vote, let the app call it.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${hanken.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">
        <SkylineBackdrop />
        {/* Own stacking context above the fixed backdrop, so the cards and
            the confetti canvas keep their own layering inside it. */}
        <div className="relative z-10 flex flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
