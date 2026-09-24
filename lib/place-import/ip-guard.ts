import { isIPv4 } from "node:net";

// Pure IP-range logic, deliberately no "server-only" import and no other
// dependency -- kept separate from safe-fetch.ts so it's directly unit
// testable without a DNS mock or a fetch mock.

function ipToUint32(ip: string): number {
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function inCidr(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipToUint32(ip) & mask) === (ipToUint32(base) & mask);
}

function isPrivateIPv4(ip: string): boolean {
  return (
    inCidr(ip, "10.0.0.0", 8) ||
    inCidr(ip, "172.16.0.0", 12) ||
    inCidr(ip, "192.168.0.0", 16) ||
    inCidr(ip, "127.0.0.0", 8) ||
    inCidr(ip, "169.254.0.0", 16) || // includes the 169.254.169.254 cloud-metadata address
    inCidr(ip, "0.0.0.0", 8) ||
    inCidr(ip, "100.64.0.0", 10) || // CGNAT (RFC 6598) -- some hosting platforms route internal service traffic here, a real reachable target, not theoretical
    inCidr(ip, "192.0.0.0", 24) || // IETF protocol assignments (RFC 6890)
    inCidr(ip, "198.18.0.0", 15) || // benchmarking (RFC 2544), used as internal space in practice
    inCidr(ip, "224.0.0.0", 4) || // multicast
    inCidr(ip, "240.0.0.0", 4) || // reserved
    ip === "255.255.255.255"
  );
}

// Expands any textual IPv6 form -- "::" compression, a zone id, a trailing
// dotted quad -- into eight 16-bit groups, or null if it is not one. The
// prefix checks below run on numbers, never on strings: "::ffff:7f00:1" and
// "::ffff:127.0.0.1" are the same address and must get the same answer.
function parseIPv6(ip: string): number[] | null {
  let s = ip.toLowerCase().split("%", 1)[0];
  const dotted = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    if (!isIPv4(dotted[2])) return null;
    const n = ipToUint32(dotted[2]);
    s = `${dotted[1]}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const groups = (part: string) =>
    part === "" ? [] : part.split(":").map((h) => (/^[0-9a-f]{1,4}$/.test(h) ? parseInt(h, 16) : NaN));
  const head = groups(halves[0]);
  const tail = halves.length === 2 ? groups(halves[1]) : [];
  if ([...head, ...tail].some(Number.isNaN)) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const fill = 8 - head.length - tail.length;
  if (fill < 1) return null;
  return [...head, ...Array<number>(fill).fill(0), ...tail];
}

function embeddedIPv4(high: number, low: number): string {
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

function isPrivateIPv6(ip: string): boolean {
  const h = parseIPv6(ip);
  if (!h) return true; // unparseable: fail closed
  const zero = (from: number, to: number) => h.slice(from, to).every((g) => g === 0);
  // NAT64 (RFC 6052/8215): the well-known /96 carries a real IPv4 address in
  // its last 32 bits, so judge that. The local-use /48 and the rest of the
  // /32 cannot be decoded reliably -- refuse them.
  if (h[0] === 0x64 && h[1] === 0xff9b) {
    return !zero(2, 6) || isPrivateIPv4(embeddedIPv4(h[6], h[7]));
  }
  // IPv4-compatible ::a.b.c.d (this also covers :: and ::1), IPv4-mapped
  // ::ffff:a.b.c.d and SIIT ::ffff:0:a.b.c.d all route to the embedded IPv4.
  if ((zero(0, 5) && (h[5] === 0 || h[5] === 0xffff)) || (zero(0, 4) && h[4] === 0xffff && h[5] === 0)) {
    return isPrivateIPv4(embeddedIPv4(h[6], h[7]));
  }
  if (h[0] < 0x100) return true; // the rest of ::/8 is reserved
  if (h[0] === 0x2002) return isPrivateIPv4(embeddedIPv4(h[1], h[2])); // 6to4 embeds the relay-side IPv4
  if (h[0] === 0x2001 && h[1] === 0) return true; // Teredo: the embedded IPv4 is obfuscated, refuse outright
  if ((h[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 (ULA)
  if ((h[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 (link-local)
  if ((h[0] & 0xffc0) === 0xfec0) return true; // fec0::/10, deprecated site-local
  if ((h[0] & 0xff00) === 0xff00) return true; // ff00::/8, multicast
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  return isIPv4(ip) ? isPrivateIPv4(ip) : isPrivateIPv6(ip);
}
