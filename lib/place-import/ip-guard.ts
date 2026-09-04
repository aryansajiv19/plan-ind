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
    inCidr(ip, "224.0.0.0", 4) || // multicast
    inCidr(ip, "240.0.0.0", 4) || // reserved
    ip === "255.255.255.255"
  );
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7 (ULA)
  if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true; // fe80::/10
  if (lower.startsWith("fec") || lower.startsWith("fed") || lower.startsWith("fee") || lower.startsWith("fef")) return true; // fec0::/10, deprecated site-local
  if (lower.startsWith("ff")) return true; // ff00::/8, multicast
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  return isIPv4(ip) ? isPrivateIPv4(ip) : isPrivateIPv6(ip);
}
