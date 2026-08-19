import type { MetadataRoute } from "next";

// Installed to a home screen this launches without browser chrome, which is
// what lets the fixed tab bar behave like a tab bar. start_url is /home so
// opening the icon lands on the product rather than the marketing page; an
// unauthenticated visitor is redirected to /login from there anyway.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Deal three | Dubai hangout decider",
    short_name: "Deal three",
    description:
      "Pick a vibe, deal nine Dubai places across three rounds, and let the group choose.",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f3f1ec",
    theme_color: "#f3f1ec",
    categories: ["social", "lifestyle", "food"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
