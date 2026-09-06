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
// Per-hop budget. TOTAL_TIMEOUT_MS is the bound that actually matters: the
// per-hop timer was armed fresh on every redirect, so three hops could take
// 15s while resolve.ts advertised "worst case ~5s". Callers get one deadline
// for the whole call now, redirects and DNS included.
const TIMEOUT_MS = 5_000;
const TOTAL_TIMEOUT_MS = 8_000;
const DNS_TIMEOUT_MS = 2_000;
const MAX_REDIRECTS = 2;
const ALLOWED_CONTENT_TYPES = ["application/json", "text/html", "text/plain"];

export class SafeFetchError extends Error {}

async function assertPublicHost(hostname: string): Promise<void> {
  let address: string;
  try {
    // Raced against a deadline: dns.lookup takes no AbortSignal, and it ran
    // BEFORE the fetch's AbortController existed, so it was covered by no
    // timeout at all. A slow resolver pinned the request handler
    // indefinitely -- the same slot-holding failure the body-read deadline
    // closed, one function earlier.
    ({ address } = await Promise.race([
      lookup(hostname),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new SafeFetchError("That link's host took too long to resolve.")), DNS_TIMEOUT_MS),
      ),
    ]));
  } catch (error) {
    if (error instanceof SafeFetchError) throw error;
    throw new SafeFetchError("That link's host could not be resolved.");
  }
  if (isPrivateAddress(address)) {
    throw new SafeFetchError("That link points somewhere this app won't fetch.");
  }
}

// Truncates at MAX_BYTES rather than throwing. The guarantee this cap exists
// to make is "never read more than MAX_BYTES from an arbitrary host", and
// stopping at the limit satisfies that exactly as well as aborting does --
// but throwing also discarded metadata that had already arrived. The clues
// this pipeline wants (<title>, og: tags) live in <head>, i.e. the first few
// KB, so a 512KB+ page used to fail with "response was too large" while
// holding everything needed in its first chunk. Verified on a real article:
// the first 512KB of the Burj Khalifa Wikipedia page carries the title and
// five og: properties.
//
// Truncating mid-document is safe for both consumers, by construction rather
// than by luck:
//  - web-adapter's regexes require a *complete* quoted attribute value
//    (`content="..."`), and carry no anchors or lookarounds, so any match in
//    a truncated prefix is a match at the same offset in the full document:
//    the captured value always exists verbatim in the real page. A tag cut
//    mid-attribute simply doesn't match. Truncation can never synthesize or
//    garble a value. It CAN change which tag wins -- if the forward
//    pattern's match spans the cut, metaContent falls through to its
//    reversed-order fallback and may pick an earlier tag -- but the page
//    author controls every candidate on their own page either way, so that
//    is a fidelity difference, not a trust boundary.
//  - oembed's JSON.parse of a truncated body throws, and it already converts
//    that into a SafeFetchError, so oversized JSON still degrades to
//    needs_input exactly as before.
//  - a multi-byte character split at the boundary decodes to U+FFFD under
//    the non-fatal decoder below, rather than throwing.
// Exported only so the truncation boundary can be tested without a network
// round trip (tests/place-import-safe-fetch.test.ts). Not part of this
// module's intended API -- callers want safeFetch().
export async function readCapped(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  // Stop pulling bytes the moment the cap is reached; the server is not
  // owed the rest of its own response.
  if (size >= MAX_BYTES) await reader.cancel();

  const bytes = new Uint8Array(Math.min(size, MAX_BYTES));
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= bytes.length) break;
    const slice = chunk.subarray(0, bytes.length - offset);
    bytes.set(slice, offset);
    offset += slice.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

// Fetches `url` with SSRF hardening and returns the capped response body as
// text. Throws SafeFetchError for anything that should surface as "couldn't
// fetch" to the resolution pipeline (never a raw network error).
export async function safeFetch(url: string): Promise<string> {
  let target = new URL(url);
  const deadline = Date.now() + TOTAL_TIMEOUT_MS;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    // The whole call is bounded, not just each hop -- otherwise the budget
    // multiplied by the redirect count.
    if (deadline - Date.now() <= 0) throw new SafeFetchError("That link took too long to respond.");
    if (target.protocol !== "https:" && target.protocol !== "http:") {
      throw new SafeFetchError("Only http/https links can be fetched.");
    }
    await assertPublicHost(target.hostname);
    // `remaining` is computed AFTER the DNS lookup, not before it. Computing
    // it first left the lookup uncharged against the budget, so the real
    // worst case was TOTAL_TIMEOUT_MS + DNS_TIMEOUT_MS per hop -- ~25% over
    // the bound this constant advertises. Third time this drift has appeared
    // in this function; the rule is that every wait belongs to the budget.

    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new SafeFetchError("That link took too long to respond.");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(TIMEOUT_MS, remaining));
    // The timeout stays armed across the BODY read, not just until headers
    // arrive. Clearing it as soon as fetch() resolved left the streaming
    // read below unbounded: a host that sends headers instantly and then
    // dribbles one byte per second holds this request for days while never
    // exceeding the byte cap (confirmed against a deliberately slow local
    // server -- still reading after 15s, 27 bytes in). This handler is
    // synchronous, so each such request pins a server slot. TIMEOUT_MS now
    // bounds the whole hop, which is what this module's callers already
    // claim ("worst case adds ~5s to a save-link request").
    try {
      let response: Response;
      try {
        response = await fetch(target, {
          redirect: "manual",
          signal: controller.signal,
          headers: { accept: ALLOWED_CONTENT_TYPES.join(", ") },
        });
      } catch {
        throw new SafeFetchError("That link could not be reached.");
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

      // `return await`, deliberately: a bare `return readCapped(...)` would
      // run the finally -- clearing the timeout -- before the body finished
      // streaming, which is the exact bug this block exists to close.
      try {
        return await readCapped(response);
      } catch (error) {
        if (error instanceof SafeFetchError) throw error;
        // An abort mid-stream surfaces as a raw AbortError; this module's
        // contract is that callers only ever see SafeFetchError.
        throw new SafeFetchError("That link took too long to send its response.");
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new SafeFetchError("That link redirected too many times.");
}
