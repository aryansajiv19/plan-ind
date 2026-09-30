import Link from "next/link";

// SPECS.md §16.1: without this, an unmatched route renders Next's bare
// framework default — no wordmark, no nav, no way back into the app.
export default function NotFound() {
  return (
    <main className="auth-shell error-shell">
      <div className="error-panel">
        <Link href="/" className="auth-mark" aria-label="Planind home">
          Planind
        </Link>
        <p className="auth-kicker">404</p>
        <h1>This page isn’t here.</h1>
        <p className="auth-copy">
          The link might be old, or the plan it pointed to may have wrapped up.
        </p>
        <Link href="/" className="auth-link">Back to Planind</Link>
      </div>
    </main>
  );
}
