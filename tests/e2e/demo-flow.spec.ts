import { test, expect } from "@playwright/test";

// The public, account-free demo: /demo's plan form plays the deal reveal on
// sample places and hands over to /demo/vote, which plays three rounds and a
// final to the winner reveal. Fixture driven end to end (no database), so
// this runs against any target.

test("/demo: submitting the plan form deals nine sample places, then links to the sample vote", async ({ page }) => {
  await page.goto("/demo");
  const submit = page.getByRole("button", { name: "Preview the deal" });
  await submit.scrollIntoViewIfNeeded();
  await submit.click();

  // The reveal's status line changes when the sequence has played.
  const status = page.locator("#deal-reveal-heading [role=status]");
  await expect(status).toHaveText("Nine places, three rounds.", { timeout: 10_000 });
  const dealt = page.getByRole("list", { name: "Nine places in three rounds" });
  await expect(dealt.getByText("Reif Japanese Kushiyaki")).toBeVisible();
  await expect(dealt.locator(":scope > li > ul > li")).toHaveCount(9);

  const next = page.getByRole("link", { name: "See how the group votes" });
  await expect(next).toHaveAttribute("href", "/demo/vote");
  await next.click();
  await expect(page).toHaveURL(/\/demo\/vote$/);
  await expect(page.locator(".vote-options-grid button.token")).toHaveCount(3, { timeout: 20_000 });
});

test("/demo/vote plays three rounds and a final to the winner reveal", async ({ page }) => {
  await page.goto("/demo/vote");
  const cards = page.locator(".vote-options-grid button.token");
  const primary = page.locator("button.vote-primary-action");

  for (const next of ["Continue to round 2", "Continue to round 3", "Build the final shortlist"]) {
    await expect(cards).toHaveCount(3, { timeout: 20_000 });
    await expect(primary).toBeDisabled(); // nothing picked yet in this round
    await cards.first().click();
    await expect(cards.first()).toHaveAttribute("aria-pressed", "true");
    await expect(primary).toHaveText(next);
    await expect(primary).toBeEnabled();
    await primary.click();
  }

  await expect(primary).toHaveText("Choose the final place");
  await expect(cards).toHaveCount(3);
  await cards.first().click();
  await primary.click();

  await expect(page.getByText("Decided · you’re going")).toBeVisible({ timeout: 20_000 });
  // The reveal settles: the canvas goes, the heading stops being hidden, and
  // it names one of the nine sample places (not an empty or stale heading).
  const name = page.locator("h2.winner-reveal__name");
  await expect(page.locator("canvas.winner-reveal__canvas")).toHaveCount(0, { timeout: 10_000 });
  await expect(name).not.toHaveAttribute("data-hidden", /.*/);
  await expect(name).toHaveText(
    /^(Reif Japanese Kushiyaki|Ravi Restaurant|3Fils|Bu Qtair|Orfali Bros Bistro|Bait Maryam|Tresind Studio|Zuma|Al Mallah)$/,
  );
});
