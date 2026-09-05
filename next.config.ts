import type { NextConfig } from "next";

const productionOrigin = process.env.NEXT_PUBLIC_SITE_URL
  ? new URL(process.env.NEXT_PUBLIC_SITE_URL).host
  : undefined;
const isProduction = process.env.NODE_ENV === "production";

// CORS, verified 2026-09-04, not assumed: deliberately no
// Access-Control-Allow-* header is set anywhere in this app (grepped every
// app/api/** route and this file). That is the secure default, not a gap --
// Next.js App Router route handlers send no CORS headers unless you add
// them, so a browser enforces same-origin by default: a cross-origin script
// cannot read any response from this app's API, and a cross-origin
// *mutating* request fails its own CORS preflight before ever reaching
// lib/security/request.ts's validateMutationRequest (a second, independent
// origin/CSRF check for the routes that need one). Confirmed live: a GET
// and a POST with a foreign Origin header, and an OPTIONS preflight for
// one, all come back with zero Access-Control-* headers. Do not add a
// permissive Access-Control-Allow-Origin here (wildcard or otherwise)
// without a real cross-origin caller that needs it -- there isn't one today.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  ...(isProduction
    ? [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        { key: "Strict-Transport-Security", value: "max-age=31536000" },
      ]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "64kb",
      ...(productionOrigin ? { allowedOrigins: [productionOrigin] } : {}),
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
