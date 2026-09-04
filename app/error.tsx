"use client";

import Link from "next/link";

// SPECS.md §16.1: catches a render error below layout.tsx (a crash inside a
// page or a Server Component). global-error.tsx is the layout-level
// counterpart — this one still runs inside the themed root layout, so it
// can safely reuse the same restraint as not-found.tsx.
export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="auth-shell error-shell">
      <div className="error-panel">
        <Link href="/" className="auth-mark" aria-label="Deal three home">
          <span>D/</span><b>03</b>
        </Link>
        <p className="auth-kicker">Something broke</p>
        <h1>That didn’t load right.</h1>
        <p className="auth-copy">
          Try again, or head back and pick up where you left off.
        </p>
        <button type="button" className="auth-submit" onClick={reset}>Try again</button>
        <Link href="/" className="auth-link">Back to Deal three</Link>
      </div>
    </main>
  );
}
