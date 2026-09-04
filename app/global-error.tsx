"use client";

// SPECS.md §16.1: only fires when the ROOT layout itself throws, so it
// replaces <html>/<body> entirely — it must supply both and cannot lean on
// globals.css, the loaded fonts, or ThemeSync, since any of those could be
// what crashed. Plain inline styles, system fonts, no theming.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "2rem",
          background: "#f7f7f5",
          color: "#1b2a4a",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: "24rem" }}>
          <p style={{ margin: 0, fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase" }}>
            Deal three
          </p>
          <h1 style={{ margin: "0.75rem 0 0.5rem", fontSize: "1.5rem" }}>Something went wrong.</h1>
          <p style={{ margin: "0 0 1.25rem", lineHeight: 1.5 }}>
            Reload the page, or try again in a moment.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: "2.75rem",
              padding: "0.6rem 1.4rem",
              border: "1px solid #1b2a4a",
              background: "transparent",
              color: "#1b2a4a",
              font: "inherit",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
