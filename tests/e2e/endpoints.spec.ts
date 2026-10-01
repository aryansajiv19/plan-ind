import { test, expect } from "@playwright/test";

// Every public endpoint answers an anonymous or malformed request with a
// typed, human-readable refusal, never a 5xx, an empty body or a stack trace.
// (POST routes need the CSRF cookie; their refusal is covered by the specs that
// drive them. These are the GETs a stranger or a crawler can hit.)

const NO_PLAN = "00000000-0000-0000-0000-000000000000";

const GETS: { path: string; status: number; json?: { error: string } | null }[] = [
  { path: "/api/health", status: 200 },
  { path: "/api/weather", status: 401, json: { error: "Sign in to see the weather." } },
  { path: "/api/place-import", status: 401, json: { error: "Sign in to view saved places." } },
  { path: "/api/spots/deal/sample", status: 400, json: { error: "Pick a type of place." } },
  { path: "/api/spots/deal/preview", status: 400, json: { error: "Pick a type of place." } },
];

for (const { path, status, json } of GETS) {
  test(`GET ${path} answers ${status}${json ? " with its message" : ""}`, async ({ request }) => {
    const response = await request.get(path);
    expect(response.status()).toBe(status);
    expect(response.headers()["content-type"]).toContain("application/json");
    const body = await response.text();
    expect(body).not.toMatch(/\bat .*\(.*:\d+:\d+\)|stack|ECONN|supabase\.co/i);
    if (json) expect(JSON.parse(body)).toEqual(json);
  });
}

test("a photo for a place that does not exist is a clean null, not an error", async ({ request }) => {
  const response = await request.get(`/api/spots/${NO_PLAN}/photo`);
  expect(response.status()).toBe(200);
  expect(await response.json()).toBeNull();
});

test("share images refuse a stranger in words", async ({ request }) => {
  for (const path of [`/plan/${NO_PLAN}/story`, "/wrapped/story"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(401);
    expect(await response.text()).toBe("Sign in first");
  }
});

test("an unknown page is a real 404 with a way home", async ({ page }) => {
  const response = await page.goto("/this-page-does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("link", { name: /home|planind|start/i }).first()).toBeVisible();
});

test("a mistyped plan link says the link is cold, not 'sign in, this link works'", async ({ page }) => {
  await page.goto("/plan/not-a-plan-id");
  await expect(page.getByText("This link’s gone cold")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("This link works.")).toHaveCount(0);
});
