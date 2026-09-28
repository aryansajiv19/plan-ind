import { test, expect } from "@playwright/test";

// The public, account-free demo: /demo's plan form plays the deal reveal on
// sample places and hands over to /demo/vote, the whole journey: pick a kind
// of night, the deal, three rounds and a final with friends voting on a
// timer, the reveal, a booking, the calendar. The journey test plays the
// dinner fixture (no database), so it runs against any target.

// Padel deals from its family (lib/spots/match.ts CATEGORY_FAMILIES).
const PADEL_FAMILY = ["sports", "padel", "adventure", "outdoors", "games"];

test("/demo: the reveal deals nine places of the picked type, then links to the sample vote", async ({ page }) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: "Move and play", exact: true }).click();
  await page.getByRole("button", { name: "Padel", exact: true }).click();
  const submit = page.getByRole("button", { name: "Preview the deal" });
  await submit.scrollIntoViewIfNeeded();
  const sample = page.waitForResponse((response) => response.url().includes("/api/spots/deal/sample"));
  await submit.click();
  const response = await sample;
  const body = response.ok() ? await response.json() as { cards: { name: string; category: string }[] | null } : { cards: null };

  // The reveal's status line changes when the sequence has played.
  const status = page.locator("#deal-reveal-heading [role=status]");
  await expect(status).toHaveText("Nine places, three rounds.", { timeout: 10_000 });
  const dealt = page.getByRole("list", { name: "Nine places in three rounds" });
  await expect(dealt.locator(":scope > li > ul > li")).toHaveCount(9);
  if (body.cards) {
    // P8: real places of the picked type, never the sample dinner deck.
    for (const card of body.cards) expect(PADEL_FAMILY).toContain(card.category);
    await expect(dealt.getByText(body.cards[0].name, { exact: true })).toBeVisible();
    await expect(dealt.getByText("Reif Japanese Kushiyaki")).toHaveCount(0);
    await expect(page.getByText(/Real places that fit your settings/)).toBeVisible();
  } else {
    // tooFew, 429 or 503: the sample decks, said out loud.
    await expect(dealt.getByText("Reif Japanese Kushiyaki")).toBeVisible();
    await expect(page.getByText(/Sample places shown/)).toBeVisible();
  }

  const next = page.getByRole("link", { name: "See how the group votes" });
  await expect(next).toHaveAttribute("href", "/demo/vote");
  await next.click();
  await expect(page).toHaveURL(/\/demo\/vote$/);
  await expect(page.getByRole("button", { name: "Deal nine" })).toBeVisible({ timeout: 20_000 });
});

test("/demo/vote plays the whole journey: compose, deal, rounds, final, reveal, booking", async ({ page }) => {
  await page.goto("/demo/vote");
  // A kind tile is named for its label and its count ("Dinner 9 places").
  const dinner = page.getByRole("button", { name: /^Dinner\b/ });
  await dinner.click();
  await expect(dinner).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Deal nine" }).click();
  const dealt = page.getByRole("list", { name: "Nine places in three rounds" });
  await expect(dealt.locator(":scope > li > ul > li")).toHaveCount(9);
  await expect(dealt.getByText("Reif Japanese Kushiyaki")).toBeVisible();
  await page.getByRole("button", { name: "Start round one" }).click();

  // The friends vote on their own once a round opens: all four are in
  // before the visitor has picked anything.
  await expect(page.getByText(/^4 picked this round/)).toBeVisible({ timeout: 10_000 });

  const cards = page.locator(".vote-options-grid .vote-option__choice"); // each card's Select button (P27)
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

  // Booking round trip: claim, mark, unmark, give it back, and the offer is
  // where it started. Local state only, and labelled so.
  await expect(page.getByText("Sample forecast")).toBeVisible();
  await expect(page.getByText("Booking · sample, nothing is booked")).toBeVisible();
  await page.getByRole("button", { name: "I’ll book it" }).click();
  await page.getByRole("button", { name: "Mark as booked" }).click();
  await expect(page.getByText("Booked by you")).toBeVisible();
  await page.getByRole("button", { name: "Unmark booked" }).click();
  await page.getByRole("button", { name: "I can’t book after all" }).click();
  await expect(page.getByText("Booked by you")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "I’ll book it" })).toBeVisible();

  // The calendar links carry the winner and the sample's Thursday evening.
  const gcal = page.getByRole("link", { name: "Add to Google Calendar" });
  await expect(gcal).toHaveAttribute("href", /^https:\/\/calendar\.google\.com\/calendar\/render\?.*dates=\d{8}T160000Z/);
  await expect(page.getByRole("link", { name: "Download .ics" })).toHaveAttribute("href", /^data:text\/calendar/);

  // Another kind of night starts the journey over.
  await page.getByRole("button", { name: "Try another kind of night" }).click();
  await expect(page.getByRole("button", { name: "Deal nine" })).toBeVisible();
});

test("/demo/vote: the sample Luna brief picks its kind of night, labelled, with no model call", async ({ page }) => {
  let modelCalls = 0;
  await page.route("**/api/smart-search", (route) => { modelCalls += 1; return route.abort(); });
  await page.goto("/demo/vote");
  await expect(page.locator("#demo-luna-input")).toHaveValue(/active for the five of us/);
  await page.getByRole("button", { name: "Build it" }).click();
  await expect(page.getByText("A fixed sample answer, no model call.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Move and play" })).toHaveAttribute("aria-pressed", "true");
  expect(modelCalls).toBe(0);
});
