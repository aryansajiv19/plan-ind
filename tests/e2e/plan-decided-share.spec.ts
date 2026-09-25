import { test, expect, type Page } from "@playwright/test";
import { NO_FIXTURE_REASON } from "./fixture";
import { signInAsMember } from "./local-stack";
import { canProvision, FILLER, SEEDED, withPlan, withSpot } from "./plan-factory";

// The plan page's newer surfaces, on plans shaped for them:
//   1. "Why this?" chips on dealt cards, derived from the plan's budget and
//      radius -- with a card that does NOT fit the budget as the control, so
//      a chip rendered on every card regardless would fail here.
//   2. A decided plan's share row: the WhatsApp link announces the winner.
//   3. The plan's share image: a PNG, cacheable for five minutes, fetched
//      with no session (it is what a link crawler gets).
//   4. The weather line: Open-Meteo is unreachable from the sandbox this was
//      written in, so the honest assertion is "the UI agrees with what
//      /api/weather actually answered" -- nothing shown on a 204, a real
//      forecast line on a 200. The network is not mocked.

const JUMEIRAH = { label: "Jumeirah", latitude: 25.204, longitude: 55.238 };

function cardFor(page: Page, name: string) {
  return page.locator(".vote-options-grid button.token").filter({ hasText: name });
}

test("dealt cards say why they were picked, and only what the deal filtered on", async ({ page, context, baseURL }) => {
  test.skip(!canProvision(), NO_FIXTURE_REASON);

  await withPlan({
    title: `E2E why-this ${Date.now()}`,
    // Pool 1 is what renders first: two under the AED 200 budget, one over.
    spotIds: [SEEDED.threeFils, SEEDED.buQtair, SEEDED.tresind, SEEDED.ravi, SEEDED.reif, ...FILLER.slice(0, 4)],
    budgetPerPerson: 200,
    radiusKm: 10,
    origin: JUMEIRAH,
  }, async (planId) => {
    await signInAsMember(context, baseURL!, `Chooser ${Date.now()}`);
    await page.goto(`/plan/${planId}`);

    const threeFils = cardFor(page, "3Fils");
    const buQtair = cardFor(page, "Bu Qtair");
    const tresind = cardFor(page, "Tresind Studio");
    await expect(threeFils).toBeVisible({ timeout: 20_000 });

    // Same area as the origin: 0 km, which the chip floors to 1.
    await expect(threeFils.getByText("Fits AED 200", { exact: true })).toBeVisible();
    await expect(threeFils.getByText("1 km away", { exact: true })).toBeVisible();

    await expect(buQtair.getByText("Fits AED 200", { exact: true })).toBeVisible();
    await expect(buQtair.getByText(/^\d+ km away$/)).toBeVisible();

    // The control: AED 550 minimum is over the plan's AED 200 budget.
    await expect(tresind).toBeVisible();
    await expect(tresind.getByText("Fits AED 200", { exact: true })).toHaveCount(0);
  });
});

test("a decided plan shares its winner, and its share image is a cacheable PNG", async ({ page, context, baseURL, request }) => {
  test.skip(!canProvision(), NO_FIXTURE_REASON);

  const winnerName = `E2E Winner ${Date.now().toString(36)}`;
  // Two days out: inside Open-Meteo's forecast window, so PlanWeather really
  // asks /api/weather rather than bailing out before any request.
  const eventTime = new Date(Date.now() + 2 * 86_400_000).toISOString();

  await withSpot({ name: winnerName, area: "Jumeirah", latitude: 25.2048, longitude: 55.2425, open_till: "11pm", min_spend: 150 }, async (winnerId) => {
    await withPlan({
      title: `E2E decided ${Date.now()}`,
      spotIds: [winnerId, SEEDED.buQtair, SEEDED.tresind, SEEDED.ravi, SEEDED.reif, ...FILLER.slice(0, 4)],
      status: "decided",
      winnerSpotId: winnerId,
      eventTime,
    }, async (planId) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      await signInAsMember(context, baseURL!, `Goer ${Date.now()}`);
      const weather = page.waitForResponse((res) => new URL(res.url()).pathname === "/api/weather", { timeout: 30_000 });
      await page.goto(`/plan/${planId}`);

      await expect(page.getByText("Decided · you’re going")).toBeVisible({ timeout: 20_000 });
      await expect(page.locator("h2.winner-reveal__name")).toHaveText(winnerName);

      // ── Share row ────────────────────────────────────────────────────
      const whatsapp = page.getByRole("link", { name: "Share on WhatsApp" });
      await expect(whatsapp).toHaveAttribute("href", /^https:\/\/wa\.me\/\?text=/);
      const href = (await whatsapp.getAttribute("href"))!;
      const message = new URL(href).searchParams.get("text") ?? "";
      expect(message).toContain(`We're going to ${winnerName}`);
      expect(message).toContain(`/plan/${planId}`);

      // ── Weather: the screen must match the route's real answer ───────
      const answer = await weather;
      const forecastCredit = page.getByRole("link", { name: "Forecast by Open-Meteo" });
      if (answer.status() === 204) {
        // Upstream unreachable: nothing rendered, no placeholder number.
        await expect(page.getByText("When", { exact: true })).toBeVisible();
        await expect(forecastCredit).toHaveCount(0);
        await expect(page.getByText(/°C/)).toHaveCount(0);
      } else {
        expect(answer.status(), "weather route answered neither 204 nor 200").toBe(200);
        await expect(forecastCredit).toBeVisible();
        await expect(page.getByText(/°C, feels like/)).toBeVisible();
      }
      expect(pageErrors, "uncaught errors on the decided page").toEqual([]);

      // ── Share image: what a link crawler fetches, with no cookies ────
      const image = await request.get(`/plan/${planId}/opengraph-image`, { maxRedirects: 0 });
      expect(image.status()).toBe(200);
      expect(image.headers()["content-type"]).toBe("image/png");
      expect(image.headers()["cache-control"]).toMatch(/(^|[\s,])max-age=300(\b|$)/);
      const body = await image.body();
      expect(body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "not a PNG").toBe(true);
    });
  });
});
