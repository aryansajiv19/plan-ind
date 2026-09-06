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
      path: request.path,
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
