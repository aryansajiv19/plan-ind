import "server-only";

import { lookup } from "node:dns/promises";
import { isPrivateAddress } from "./ip-guard";

// The SSRF-hardened fetch primitive for anything under lib/place-import/**.
// Used both for the fixed-host oEmbed adapters (low risk -- the destination
// host is a hardcoded literal, only the query string is user-influenced) and
// for the generic `web` adapter (real risk -- the destination host itself is
// user-supplied). Same primitive either way for one code path to reason
// about, not two.
//
// Residual risk, stated plainly rather than glossed over: this resolves DNS
// once up front and checks the resolved address, but does not pin that
// address at the TCP layer -- a DNS-rebinding attacker who controls the
// answer and wins a race between this check and the actual connect could
// theoretically slip a private-IP fetch through. Accepted for this app's
// threat tier (a going-out group-planning app, not a bank); revisit with a
// pinned-connect (a custom `dns.lookup` passed to an http(s).Agent) if this
// ever handles something more sensitive.

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 2;
const ALLOWED_CONTENT_TYPES = ["application/json", "text/html", "text/plain"];

export class SafeFetchError extends Error {}

async function assertPublicHost(hostname: string): Promise<void> {
  let address: string;
  try {
    ({ address } = await lookup(hostname));
  } catch {
    throw new SafeFetchError("That link's host could not be resolved.");
  }
  if (isPrivateAddress(address)) {
    throw new SafeFetchError("That link points somewhere this app won't fetch.");
  }
}

async function readCapped(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new SafeFetchError("That link's response was too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

// Fetches `url` with SSRF hardening and returns the capped response body as
// text. Throws SafeFetchError for anything that should surface as "couldn't
// fetch" to the resolution pipeline (never a raw network error).
export async function safeFetch(url: string): Promise<string> {
  let target = new URL(url);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (target.protocol !== "https:" && target.protocol !== "http:") {
      throw new SafeFetchError("Only http/https links can be fetched.");
    }
    await assertPublicHost(target.hostname);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(target, {
        redirect: "manual",
        signal: controller.signal,
        headers: { accept: ALLOWED_CONTENT_TYPES.join(", ") },
      });
    } catch {
      throw new SafeFetchError("That link could not be reached.");
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new SafeFetchError("That link redirected without a destination.");
      target = new URL(location, target);
      continue;
    }

    if (!response.ok) throw new SafeFetchError(`That link's server returned ${response.status}.`);

    const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim() ?? "";
    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
      throw new SafeFetchError("That link did not return a supported content type.");
    }

    return readCapped(response);
  }
  throw new SafeFetchError("That link redirected too many times.");
}
