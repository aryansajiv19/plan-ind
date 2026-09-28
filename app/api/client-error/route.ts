import { log } from "@/lib/observability/log";
import { readJsonBody, requestError, validateMutationRequest } from "@/lib/security/request";

// The browser's half of error reporting: app/error.tsx posts what broke so a
// client-only crash (the vote page is all client code) leaves a server log
// line with its digest. Same-origin + CSRF like every mutation; fields are
// cut short and only logged, never stored or echoed back.
export async function POST(request: Request) {
  let body: unknown;
  try {
    validateMutationRequest(request);
    body = await readJsonBody(request, 2_000);
  } catch (error) {
    return requestError(error, "The report could not be read.");
  }
  const field = (key: string, max: number) => {
    const value = (body as Record<string, unknown> | null)?.[key];
    return typeof value === "string" ? value.slice(0, max) : null;
  };
  log("error", "client.render_error", { digest: field("digest", 64), message: field("message", 300), path: field("path", 200) });
  return new Response(null, { status: 204 });
}
