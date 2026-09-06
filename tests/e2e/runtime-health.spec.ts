import { test, expect, type Page } from "@playwright/test";

// Runtime bug-hunt: the failures that ship silently because nothing throws.
//
// Written after a real one got through today — six venue photos were pointed
// at storage URLs whose object keys had lost their hyphens on upload. The
// page rendered perfectly: hero, title, gradient, the photo credit. Only the
// image was a 404, and nothing anywhere reported it. The layout suite passed,
// the unit tests passed, and the page looked finished.
//
// So this asserts the three things a page can get wrong while looking right:
//   - a request it made failed (4xx/5xx or aborted)
//   - an image element resolved to nothing (naturalWidth === 0)
//   - the console carries errors or unhandled rejections
//
// Public pages only, unauthenticated, no writes.

const PAGES = ["/", "/login", "/privacy", "/terms"] as const;

// Noise that is not a defect. Keep this list short and justified — every
// entry here is a class of bug this suite can no longer see.
const IGNORED_CONSOLE = [
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
  // Next dev-server HMR chatter; absent in a production build.
  /webpack-hmr|_next\/static\/webpack/i,
];

type Collected = {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: { url: string; failure: string }[];
  badResponses: { url: string; status: number }[];
};

function collect(page: Page): Collected {
  const out: Collected = { consoleErrors: [], pageErrors: [], failedRequests: [], badResponses: [] };
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (IGNORED_CONSOLE.some((re) => re.test(text))) return;
    out.consoleErrors.push(text);
  });
  // An uncaught exception or unhandled rejection in the page.
  page.on("pageerror", (error) => out.pageErrors.push(error.message));
  page.on("requestfailed", (req) => {
    const failure = req.failure()?.errorText ?? "unknown";
    // Playwright reports a deliberate abort as a failure; it is not one.
    if (/ERR_ABORTED/i.test(failure)) return;
    out.failedRequests.push({ url: req.url(), failure });
  });
  page.on("response", (res) => {
    if (res.status() >= 400) out.badResponses.push({ url: res.url(), status: res.status() });
  });
  return out;
}

for (const path of PAGES) {
  test(`no runtime errors or failed requests: ${path}`, async ({ page }) => {
    const found = collect(page);
    await page.goto(path, { waitUntil: "networkidle" });

    expect(found.pageErrors, `uncaught exceptions on ${path}: ${JSON.stringify(found.pageErrors, null, 1)}`)
      .toEqual([]);
    expect(found.consoleErrors, `console errors on ${path}: ${JSON.stringify(found.consoleErrors, null, 1)}`)
      .toEqual([]);
    expect(found.failedRequests, `requests that failed outright on ${path}: ${JSON.stringify(found.failedRequests, null, 1)}`)
      .toEqual([]);
    expect(found.badResponses, `4xx/5xx responses on ${path}: ${JSON.stringify(found.badResponses, null, 1)}`)
      .toEqual([]);
  });

  // The bug that got through today. An <img> whose src 404s still lays out,
  // still renders its caption, and reports nothing — naturalWidth is the only
  // signal, and only after load settles.
  test(`every image actually resolved: ${path}`, async ({ page }) => {
    await page.goto(path, { waitUntil: "networkidle" });
    const broken = await page.evaluate(() =>
      Array.from(document.querySelectorAll("img"))
        .filter((img) => {
          const r = img.getBoundingClientRect();
          // Skip images not laid out at all; a hidden decorative img that
          // never loads is not a user-visible defect.
          return r.width > 1 && r.height > 1 && img.naturalWidth === 0;
        })
        .map((img) => ({ src: img.currentSrc || img.src, alt: img.alt })),
    );
    expect(broken, `images that rendered nothing on ${path}: ${JSON.stringify(broken, null, 1)}`).toEqual([]);
  });
}

// The place page is where today's broken image actually lived, and it is the
// only public route that renders a venue photo. Museum of the Future is one
// of the six spots with a photo, so this is a real assertion rather than a
// vacuous pass over a null photo_url.
test("a venue page with a photo renders that photo and its credit", async ({ page }) => {
  const found = collect(page);
  await page.goto("/place/87000000-0000-0000-0000-000000000003", { waitUntil: "networkidle" });

  const hero = page.locator("img.place-hero__img");
  await expect(hero, "the place hero image is missing entirely").toHaveCount(1);
  const naturalWidth = await hero.evaluate((img: HTMLImageElement) => img.naturalWidth);
  expect(naturalWidth, "the place hero image resolved to nothing — a 404 that still lays out").toBeGreaterThan(0);

  // CC-BY images carry credit as a licence condition, not as a nicety, so an
  // unrendered credit is a licensing problem rather than a cosmetic one.
  await expect(page.getByText(/Wikimedia Commons/i).first()).toBeVisible();

  expect(found.badResponses, `4xx/5xx while loading the place page: ${JSON.stringify(found.badResponses, null, 1)}`)
    .toEqual([]);
});
