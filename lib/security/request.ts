import { timingSafeEqual } from "node:crypto";

export class RequestValidationError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function equalText(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function validateMutationRequest(request: Request): void {
  const origin = request.headers.get("origin");
  const expectedOrigin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "")
    ?? new URL(request.url).origin;
  if (!origin || origin !== expectedOrigin) {
    throw new RequestValidationError(403, "Request origin was not accepted.");
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    throw new RequestValidationError(403, "Cross-site requests are not accepted.");
  }

  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookieName = process.env.NODE_ENV === "production" ? "__Host-csrf" : "csrf";
  const token = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
  const supplied = request.headers.get("x-csrf-token");
  if (!token || !supplied || !equalText(token, supplied)) {
    throw new RequestValidationError(403, "Security token is missing or expired.");
  }
}

export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (contentType !== "application/json") {
    throw new RequestValidationError(415, "Content-Type must be application/json.");
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestValidationError(413, "Request body is too large.");
  }

  if (!request.body) throw new RequestValidationError(400, "Request body is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new RequestValidationError(413, "Request body is too large.");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new RequestValidationError(400, "Request body must contain valid JSON.");
  }
}

export function plainText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .trim()
    .slice(0, maxLength);
}

export function requestError(error: unknown, fallback: string): Response {
  if (error instanceof RequestValidationError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return Response.json({ error: fallback }, { status: 500 });
}
