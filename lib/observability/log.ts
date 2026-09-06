// Structured logging for the pieces of this app that currently fail
// silently.
//
// Deliberately zero dependencies and stdout-only. Every host this app could
// run on (Vercel included) ingests stdout and indexes JSON lines, so one
// `console.log` of a JSON object is queryable in production without buying
// into a vendor SDK first. Tracing is a separate, later decision -- there is
// nowhere to send a span until a deploy target exists, and adding an
// exporter that points at nothing is the "technology for its own sake" the
// engineering bar in CLAUDE.md rules out.
//
// The 7 existing `console.error(msg, JSON.stringify({...}))` call sites in
// app/** and lib/security/** already log a message plus a JSON blob, which
// is nearly this shape -- they are not rewritten here only because those
// files are actively owned by another lane right now. This is the target
// shape for them.

// Substring markers, not an exact-name set. An allow-by-default list is the
// wrong shape for a credential filter: the first live probe of this hook
// caught `x-middleware-set-cookie` carrying the `__Host-csrf` token, a
// header no exact-name list would have contained because Next invents it.
// Matching on markers means the next framework-invented `*-cookie` or
// `*-token` header is caught before anyone notices it exists. Over-redacting
// a header costs a debugging detail; under-redacting one writes a live
// credential into the platform's log store.
const SENSITIVE_MARKERS = [
  "cookie",
  "authorization",
  "token",
  "secret",
  "password",
  "csrf",
  "api-key",
  "apikey",
  "session",
  // `referer` carries the full previous URL, which on /auth/callback is the
  // OAuth redirect complete with its `?code=` PKCE grant. Redacted whole
  // rather than parsed: a partial redactor that tries to strip only the
  // query is one URL shape away from leaking, and no log line here needs
  // the referer badly enough to take that trade.
  "referer",
  "referrer",
];

/**
 * Strip credential-bearing headers before anything is logged.
 *
 * This is the whole reason this module has a test. Next's `onRequestError`
 * hands over the full request headers, and this app authenticates with a
 * JS-readable `sb-*` auth cookie (HttpOnly is deliberately absent -- see
 * PRODUCTION_CHECKLISTS.md), so logging headers wholesale would write live
 * session tokens into the platform's log store, where they are readable by
 * anyone with log access and outlive the session itself.
 *
 * Matching is by substring marker rather than exact name -- see
 * SENSITIVE_MARKERS for why an exact-name list is the wrong shape here.
 */
export function redactHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [rawName, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    const name = rawName.toLowerCase();
    // `sb-<project-ref>-auth-token` is the @supabase/ssr session cookie and
    // its chunked `.0`/`.1` siblings; the project ref varies, so match the
    // prefix rather than enumerating names.
    const sensitive =
      // `sb-<project-ref>-auth-token` and its chunked siblings.
      name.startsWith("sb-") || SENSITIVE_MARKERS.some((marker) => name.includes(marker));
    safe[name] = sensitive ? "[redacted]" : Array.isArray(value) ? value.join(", ") : value;
  }
  return safe;
}

/**
 * Narrow an `unknown` throw into something loggable.
 *
 * Next types the error as `unknown` because it genuinely can be: a thrown
 * string, a rejected non-Error, or -- per the instrumentation docs -- a
 * React-processed stand-in rather than the original throw. `digest` is how
 * you correlate the stand-in back to the real error, so it is kept.
 */
export function serializeError(error: unknown): {
  name: string;
  message: string;
  digest?: string;
  stack?: string;
} {
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String((error as { digest: unknown }).digest)
      : undefined;
  if (error instanceof Error) {
    return { name: error.name, message: error.message, digest, stack: error.stack };
  }
  return { name: "NonError", message: String(error), digest };
}

export type LogLevel = "error" | "warn" | "info";

/**
 * Emit one structured JSON line.
 *
 * Never throws: a logger that can fail turns a handled error into an
 * unhandled one, and this runs on the error path by definition. A circular
 * or otherwise unserializable field falls back to a minimal line rather
 * than taking the request down with it.
 */
export function log(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
  let line: string;
  try {
    line = JSON.stringify({ level, event, at: new Date().toISOString(), ...fields });
  } catch {
    line = JSON.stringify({ level, event, at: new Date().toISOString(), serializationFailed: true });
  }
  // console.error for error/warn so the platform routes them to its error
  // stream; console.log otherwise.
  if (level === "info") console.log(line);
  else console.error(line);
}
