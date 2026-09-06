// Next.js instrumentation hook -- see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md
// (read before writing this, per AGENTS.md; `onRequestError` is stable as
// of v15 and this app is on 16).
//
// WHY THIS FILE EXISTS: before it, a server error in a Server Component, a
// route handler or a Server Action was invisible. The app had exactly 7
// `console.error` calls, all on paths that had *already* caught and handled
// their error -- so the errors nobody anticipated, which are the ones worth
// knowing about, went nowhere at all. In production that means a route can
// break for every user and leave no trace.
//
// No `register()` export: it is optional, and there is nothing to register.
// Tracing (`@vercel/otel`) is deliberately deferred until a deploy target
// exists -- an exporter pointing at nothing is not observability.

import type { Instrumentation } from "next";
import { log, redactHeaders, serializeError } from "@/lib/observability/log";

export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  // Synchronous by design. The docs require awaiting any async work here,
  // and this hook runs while a request is already failing -- stdout needs
  // no await, so there is nothing to get wrong.
  log("error", "server_error", {
    ...serializeError(error),
    request: {
      // PATHNAME ONLY. Next's own docs type this as "resource path, e.g.
      // /blog?name=foo" -- the query string is included. /auth/callback
      // carries the OAuth `code` there, so logging it whole would write a
      // live, still-redeemable PKCE grant into the platform log store on any
      // unhandled throw before the exchange completes.
      //
      // Found by a security review, and the sting is that redactHeaders
      // already strips `referer` for carrying exactly this value, reasoning
      // that a partial redactor is one URL shape away from leaking. That
      // reasoning was applied to the derivative copy while the canonical
      // carrier one line away went untouched. Splitting is safe here because
      // a pathname cannot contain "?".
      path: request.path.split("?", 1)[0],
      method: request.method,
      // Redacted: these are the real request headers, and this app's session
      // cookie is JS-readable by design. See redactHeaders' own comment.
      headers: redactHeaders(request.headers),
    },
    context: {
      routerKind: context.routerKind,
      routePath: context.routePath,
      routeType: context.routeType,
      renderSource: context.renderSource,
      revalidateReason: context.revalidateReason,
    },
  });
};
