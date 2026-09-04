import assert from "node:assert/strict";
import test from "node:test";
import { isPrivateAddress } from "../lib/place-import/ip-guard.ts";

test("blocks loopback, private, link-local, cloud-metadata, CGNAT, multicast and reserved IPv4 ranges", () => {
  for (const ip of [
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "0.0.0.0",
    "100.64.0.1", "100.127.255.255", "224.0.0.1", "240.0.0.1", "255.255.255.255",
  ]) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
});

test("allows real public IPv4 addresses, including just outside CGNAT's range", () => {
  for (const ip of ["8.8.8.8", "1.1.1.1", "172.15.255.255", "172.32.0.1", "93.184.216.34", "100.63.255.255", "100.128.0.0"]) {
    assert.equal(isPrivateAddress(ip), false, ip);
  }
});

test("blocks loopback, unspecified, ULA, link-local, deprecated site-local and multicast IPv6 ranges, including IPv4-mapped private addresses", () => {
  for (const ip of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "fec0::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1"]) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
});

test("allows real public IPv6 addresses, including IPv4-mapped public addresses", () => {
  for (const ip of ["2001:4860:4860::8888", "::ffff:8.8.8.8"]) {
    assert.equal(isPrivateAddress(ip), false, ip);
  }
});
