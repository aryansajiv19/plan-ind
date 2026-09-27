import localFont from "next/font/local";

// The landing's sign lettering (experimental track). Declared here, not in the
// root layout, so only the pages that render the sign street download them.
export const signLatin = localFont({
  src: "../../public/fonts/big-shoulders-display-variable-latin.woff2",
  weight: "500 900",
  variable: "--font-sign",
  display: "swap",
});

export const signArabic = localFont({
  src: "../../public/fonts/noto-kufi-arabic-variable-arabic.woff2",
  weight: "500 800",
  variable: "--font-sign-arabic",
  display: "swap",
});
