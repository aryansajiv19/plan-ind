import { test } from "node:test";
import assert from "node:assert/strict";
import { clipPolygon, labelBox, labelCandidates, landPath, placeLabels, roadPath, sideLabel, type Box } from "@/lib/basemap";

// DubaiMiniMap's frame for a venue in Downtown (640x360, ~2.5 km tall).
const W = 640, H = 360;
const frame = (cLat: number, cLng: number, spanLat = 0.045) => {
  const spanLng = (spanLat * (W / H)) / Math.cos((cLat * Math.PI) / 180);
  return (lng: number, lat: number): [number, number] => [((lng - cLng) / spanLng + 0.5) * W, (0.5 - (lat - cLat) / spanLat) * H];
};
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test("a polygon is clipped to the rectangle, crossing points on its edges", () => {
  const square: [number, number][] = [[-10, -10], [10, -10], [10, 10], [-10, 10]];
  const clipped = clipPolygon(square, 0, 0, 20, 20);
  assert.deepEqual(clipped.map(([x, y]) => [Math.round(x), Math.round(y)]).sort(), [[0, 0], [0, 10], [10, 0], [10, 10]].sort());
  assert.deepEqual(clipPolygon(square, 50, 50, 60, 60), [], "nothing in the frame, nothing drawn");
});

test("the frame carries only nearby land and roads, never all of Dubai", () => {
  const downtown = frame(25.197, 55.274);
  const land = landPath(downtown, W, H);
  const roads = roadPath(downtown, W, H);
  assert.ok(land.length > 0 && roads.length > 0, "Downtown has land and Sheikh Zayed Road");
  const coords = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  assert.ok(coords(land).every((n) => n >= -12.01 && n <= W + 12.01), "land clipped to the frame plus its margin");
  assert.ok(land.length < 20_000, `a few hundred points, not the whole coast (${land.length} chars)`);
  // Far out to sea there is no land at all.
  assert.equal(landPath(frame(25.6, 54.9), W, H), "");
});

test("district names sit inside the frame, clear of the pin and of each other", () => {
  const project = frame(25.186, 55.262); // a venue in Business Bay, the Burj off to its north-east
  const pin: Box = { x: W / 2 - 18, y: H / 2 - 26, w: 36, h: 44 };
  const labels = placeLabels(labelCandidates(project, W, H), W, H, [pin]);
  assert.ok(labels.length > 0);
  assert.ok(labels.some((l) => l.landmark), "the Burj Khalifa is named when it is in view");
  const boxes = labels.map((l) => labelBox(l.text, l.x, l.y));
  // At twice the size (a phone), fewer names fit, and the same rules hold.
  const big = placeLabels(labelCandidates(project, W, H), W, H, [pin], { size: 24, margin: 20 });
  assert.ok(big.length <= labels.length);
  const bigBoxes = big.map((l) => labelBox(l.text, l.x, l.y, 24));
  for (const [i, b] of bigBoxes.entries()) {
    assert.ok(b.x >= 20 && b.x + b.w <= W - 20, `${big[i].text} touches an edge at phone size`);
    for (const other of bigBoxes.slice(i + 1)) assert.ok(!overlaps(b, other), `${big[i].text} overlaps another name at phone size`);
  }
  for (const [i, b] of boxes.entries()) {
    assert.ok(b.x >= 10 && b.y >= 10 && b.x + b.w <= W - 10 && b.y + b.h <= H - 10, `${labels[i].text} touches an edge`);
    assert.ok(!overlaps(b, pin), `${labels[i].text} covers the pin`);
    for (const other of boxes.slice(i + 1)) assert.ok(!overlaps(b, other), `${labels[i].text} overlaps another name`);
  }
});

test("a venue's name flips to the left of its pin rather than running off the edge", () => {
  const right = sideLabel("Reif Japanese Kushiyaki", 600, 100, W, 18);
  assert.equal(right.anchor, "end");
  assert.ok(right.box.x >= 10 && right.box.x + right.box.w <= 600, "inside the frame, left of the pin");
  assert.equal(sideLabel("3Fils", 100, 100, W, 18).anchor, "start");
});
