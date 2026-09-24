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

test("blocks the IETF-assignment and benchmarking IPv4 ranges, and nothing either side", () => {
  for (const ip of ["192.0.0.1", "192.0.0.255", "198.18.0.1", "198.19.255.255"]) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  for (const ip of ["192.0.1.1", "198.17.255.255", "198.20.0.0"]) {
    assert.equal(isPrivateAddress(ip), false, ip);
  }
});

test("judges IPv6 forms that embed an IPv4 address by that address, however they are written", () => {
  for (const ip of [
    "::ffff:7f00:1", // hex-form IPv4-mapped 127.0.0.1
    "::ffff:a9fe:a9fe", // hex-form 169.254.169.254
    "0:0:0:0:0:ffff:127.0.0.1",
    "::127.0.0.1", "::a9fe:a9fe", // IPv4-compatible
    "::ffff:0:10.0.0.1", // SIIT
    "64:ff9b::7f00:1", "64:ff9b::10.0.0.1", // NAT64 well-known prefix
    "2002:7f00:1::", "2002:a9fe:a9fe::1", // 6to4
  ]) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  // Positive control: the same forms around a public address still pass.
  for (const ip of ["::ffff:808:808", "64:ff9b::8.8.8.8", "2002:808:808::1"]) {
    assert.equal(isPrivateAddress(ip), false, ip);
  }
});

test("blocks IPv6 ranges that cannot be judged by an embedded address", () => {
  for (const ip of ["64:ff9b:1::1", "64:ff9b:1:ffff::8.8.8.8", "2001:0:4136:e378::1", "ab::1", "fe80::1%eth0"]) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
});

test("fails closed on anything that is not an address", () => {
  for (const ip of ["", "localhost", "1::2::3", "12345::", "1:2:3:4:5:6:7:8:9"]) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
});
