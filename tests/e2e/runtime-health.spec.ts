import { test, expect, type Frame, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { isLocalStack, localAdmin } from "./local-stack";

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

const PAGES = ["/", "/login", "/privacy", "/terms", "/demo", "/demo/vote"] as const;

// Turnstile keeps the load event pending forever in a headless context, so
// `networkidle` never fires on /login ONCE A SITE KEY IS CONFIGURED. Root-
// caused rather than guessed: same build, same server, key unset -> 9/9
// pass, key set to Cloudflare's test key -> both /login tests hang.
//
// This is not an environment quirk to shrug at. Turnstile is deprioritised,
// not abandoned, and the day it is configured these specs would start
// failing for a reason that has nothing to do with the page. (The vote specs
// once required the key, for a plan-access captcha that anonymous guests
// passed; that screen went with the guests on 2026-09-25, and the vote specs
// now sign in with an injected account session instead.)
//
// `domcontentloaded` plus an explicit wait for real content keeps the
// coverage that matters: requests still fire, failures are still collected,
// images still resolve. Only the "wait for silence" step is dropped, and on
// this page silence never comes by design.
const SETTLE = { waitUntil: "domcontentloaded" } as const;
const IDLE = { waitUntil: "networkidle" } as const;
const gotoOptions = (path: string) => (path === "/login" ? SETTLE : IDLE);

/** Give a captcha-bearing page a moment for its own requests to fire. */
async function settle(page: Page, path: string) {
  if (path !== "/login") return;
  await page.locator("form").first().waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForTimeout(1_000);
}


// Noise that is not a defect. Keep this list short and justified — every
// entry here is a class of bug this suite can no longer see.
const IGNORED_CONSOLE = [
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
  // Next dev-server HMR chatter; absent in a production build.
  /webpack-hmr|_next\/static\/webpack/i,
  // CI builds without a Turnstile site key on purpose (sign-in is injected,
  // never solved), and the login page says so loudly -- right wherever the key
  // should exist, so this is ignored only when this run has none.
  ...(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? [] : [/^Turnstile: NEXT_PUBLIC_TURNSTILE_SITE_KEY is not set$/]),
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
  // Only the page's own frame counts: a third-party iframe's inner traffic (the
  // Google map on /place, a Turnstile widget) isn't ours to break or fix, and
  // one Google map tile answering 500 once failed this spec on a clean run.
  const ours = (frame: () => Frame) => { try { return frame() === page.mainFrame(); } catch { return false; } };
  page.on("requestfailed", (req) => {
    if (!ours(() => req.frame())) return;
    const failure = req.failure()?.errorText ?? "unknown";
    // Playwright reports a deliberate abort as a failure; it is not one.
    if (/ERR_ABORTED/i.test(failure)) return;
    out.failedRequests.push({ url: req.url(), failure });
  });
  page.on("response", (res) => {
    if (!ours(() => res.frame())) return;
    if (res.status() >= 400) out.badResponses.push({ url: res.url(), status: res.status() });
  });
  return out;
}

/**
 * Scroll the whole page so every lazy image is asked for, then give them
 * time to finish. Without this a below-the-fold lazy image reads as broken
 * (naturalWidth 0 because it was never requested) -- the live front door
 * failed that way with three good photos.
 */
async function loadEveryImage(page: Page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += window.innerHeight / 2) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    window.scrollTo(0, 0);
  });
  // A Google photo is fetched only once its card nears the viewport, then its
  // <img> is inserted: let those requests land before judging (a /demo flake).
  // Capped: /login's captcha widget never lets the network go idle.
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  await page.waitForFunction(() => Array.from(document.images).every((img) => img.complete), null, { timeout: 15_000 })
    .catch(() => undefined); // an image that never finishes is reported by the check itself
}

/** Venue photos: ours (self-hosted or the storage bucket), the demo's, or Google's. */
const VENUE_PHOTO = /\/venues\/|spot-photos|\/demo\/[^/?]+\.(webp|jpe?g|png)|googleusercontent/;

for (const path of PAGES) {
  test(`no runtime errors or failed requests: ${path}`, async ({ page }) => {
    const found = collect(page);
    await page.goto(path, gotoOptions(path));
    await settle(page, path);

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
    await page.goto(path, gotoOptions(path));
    await settle(page, path);
    await loadEveryImage(page);
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

  // A photo shown without its credit is a licence breach for the CC-BY ones
  // (PhotoCredit), so every venue photo must have its credit beside it.
  test(`every venue photo carries its credit: ${path}`, async ({ page }) => {
    await page.goto(path, gotoOptions(path));
    await settle(page, path);
    await loadEveryImage(page);
    const uncredited = await page.evaluate((pattern) =>
      Array.from(document.querySelectorAll("img"))
        .filter((img) => new RegExp(pattern).test(decodeURIComponent(img.currentSrc || img.src)))
        .filter((img) => !img.parentElement?.querySelector(".photo-credit"))
        .map((img) => decodeURIComponent(img.currentSrc || img.src)), VENUE_PHOTO.source);
    expect(uncredited, `venue photos with no credit on ${path}: ${JSON.stringify(uncredited, null, 1)}`).toEqual([]);
  });
}

// Every venue page the front door links to: it loads, logs nothing, and its
// photos resolve with their credits. (The place page once crashed for every
// venue -- a client function called on the server -- and only a place-page
// spec noticed.)
test("every venue page linked from the front door loads cleanly, photos resolved and credited", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/", IDLE);
  const hrefs = [...new Set(await page.locator('a[href^="/place/"]').evaluateAll(
    (links) => links.map((a) => (a as HTMLAnchorElement).getAttribute("href")!.split("?")[0])))];
  expect(hrefs.length, "the front door links to no venue pages").toBeGreaterThan(0);
  const problems: string[] = [];
  for (const href of hrefs) {
    const found = collect(page);
    const response = await page.goto(href, IDLE);
    if (response?.status() !== 200) problems.push(`${href}: status ${response?.status()}`);
    await loadEveryImage(page);
    const [broken, uncredited] = await page.evaluate((pattern) => {
      const imgs = Array.from(document.querySelectorAll("img"));
      const laidOut = (img: HTMLImageElement) => { const r = img.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
      const src = (img: HTMLImageElement) => decodeURIComponent(img.currentSrc || img.src);
      return [
        imgs.filter((img) => laidOut(img) && img.naturalWidth === 0).map(src),
        imgs.filter((img) => new RegExp(pattern).test(src(img)) && !img.parentElement?.querySelector(".photo-credit")).map(src),
      ];
    }, VENUE_PHOTO.source);
    for (const [what, list] of [["uncaught exceptions", found.pageErrors], ["console errors", found.consoleErrors],
      ["4xx/5xx", found.badResponses.map((r) => `${r.status} ${r.url}`)], ["images that rendered nothing", broken],
      ["photos with no credit", uncredited]] as const) {
      if (list.length) problems.push(`${href}: ${what}: ${JSON.stringify(list)}`);
    }
    page.removeAllListeners("console"); page.removeAllListeners("pageerror");
    page.removeAllListeners("requestfailed"); page.removeAllListeners("response");
  }
  expect(problems, `venue pages from the front door (${hrefs.length} checked):\n${problems.join("\n")}`).toEqual([]);
});

// The place page is where today's broken image actually lived, and it is the
// only public route that renders a venue photo.
//
// Against a deployment, Museum of the Future is one of the six spots with a
// photo (migration 039), so this is a real assertion rather than a vacuous
// pass over a null photo_url. A local stack loaded from schema.sql + seed.sql
// has no such row (039 is data against the LIVE bucket, not part of the
// schema) and the page 404s, so locally the spec provisions its own curated
// spot. Its photo is a same-origin static asset because the production CSP's
// img-src allows 'self' and https: only -- a http://127.0.0.1 storage URL
// would be blocked, and pointing at the live bucket would leave loopback.
const HOSTED_PHOTO_SPOT = "87000000-0000-0000-0000-000000000003";

async function withPhotoSpot(run: (spotId: string) => Promise<void>): Promise<void> {
  if (!isLocalStack(process.env.NEXT_PUBLIC_SUPABASE_URL)) return run(HOSTED_PHOTO_SPOT);
  const admin = localAdmin();
  const spotId = randomUUID();
  const { error } = await admin.from("spots").insert({
    id: spotId, name: "E2E photo spot", category: "culture", area: "Trade Centre", cuisine: "Museum",
    price_band: "$$", min_spend: 100, open_till: "9pm", vibe: "Fixture for the photo check",
    source: "curated", photo_url: "/demo/alserkal-dinner.webp", photo_source: "wikimedia",
    photo_attribution: "E2E fixture / Wikimedia Commons / CC BY 4.0",
  });
  if (error) throw new Error(`provisioning the photo spot failed: ${error.message}`);
  try {
    await run(spotId);
  } finally {
    await admin.from("spots").delete().eq("id", spotId);
  }
}

test("a venue page with a photo renders that photo and its credit", async ({ page }) => withPhotoSpot(async (spotId) => {
  const found = collect(page);
  await page.goto(`/place/${spotId}`, { waitUntil: "networkidle" });

  const hero = page.locator("img.place-hero__img");
  await expect(hero, "the place hero image is missing entirely").toHaveCount(1);
  const naturalWidth = await hero.evaluate((img: HTMLImageElement) => img.naturalWidth);
  expect(naturalWidth, "the place hero image resolved to nothing — a 404 that still lays out").toBeGreaterThan(0);

  // CC-BY images carry credit as a licence condition, not as a nicety, so an
  // unrendered credit is a licensing problem rather than a cosmetic one.
  await expect(page.getByText(/Wikimedia Commons/i).first()).toBeVisible();

  expect(found.badResponses, `4xx/5xx while loading the place page: ${JSON.stringify(found.badResponses, null, 1)}`)
    .toEqual([]);
}));
