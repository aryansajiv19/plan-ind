import { test, expect, type Page } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { localAdmin, signInAsMember, type Member } from "./local-stack";
import { canProvision } from "./plan-factory";

// Crew match (088) on Friends: you and one friend, a 0-100 match from shared
// signals and a months-running streak. The demo shows the real card on
// sample numbers; signed in, the card reads the crew_match / crew_streak RPCs,
// which say "not enough yet" under three signals and refuse anyone who is not
// your friend (42501): that must read as a failed load, never as a number.

const EMOJI = /\p{Extended_Pictographic}/u;

test.describe("demo", () => {
  test("every sample friend switches the card; Maya is locked, Sara is 87%", async ({ page }) => {
    await page.goto("/demo?view=friends");
    const crew = page.locator("#workspace section.crew");
    await expect(crew.getByRole("heading", { name: "Crew match" })).toBeVisible({ timeout: 20_000 });
    await crew.locator("summary").click(); // folded by default; the people come first
    const chips = crew.getByRole("group", { name: "Friend" }).getByRole("button");
    const names = await chips.allInnerTexts();
    expect(names.length).toBeGreaterThan(1);

    for (const [i, name] of names.entries()) {
      await chips.nth(i).click();
      for (const [j] of names.entries()) await expect(chips.nth(j)).toHaveAttribute("aria-pressed", String(i === j));
      await expect(crew.locator(".crew__locked, .crew__ready")).toContainText(name.split(" ")[0]);
      expect(await crew.innerText()).not.toMatch(EMOJI);
    }

    await crew.getByRole("button", { name: /^Maya\b/ }).click();
    await expect(crew.locator(".crew__locked")).toContainText("1 more plan together");
    await expect(crew.locator(".crew__dots span")).toHaveCount(3);
    await expect(crew.locator(".crew__dots span[data-done]")).toHaveCount(2);
    await expect(crew.locator(".crew__score")).toHaveCount(0);
    expect(await crew.innerText()).not.toContain("%");

    await crew.getByRole("button", { name: /^Sara\b/ }).click();
    await expect(crew.locator(".crew__score strong")).toHaveText("87%");
    await expect(crew.locator(".crew__parts li")).toHaveCount(3);
    await expect(crew.locator(".crew__split")).toHaveText("You split on nights out.");
  });
});

test.describe("signed in", () => {
  test.skip(!canProvision(), "needs the local stack to mint accounts");

  async function friends(a: Member, b: Member) {
    const { error } = await localAdmin().from("friendships").insert({ person_id: a.userId, friend_id: b.userId });
    if (error) throw new Error(`friendship failed: ${error.message}`); // mirrored by a trigger
  }
  async function openCrew(page: Page) {
    await page.goto("/home?view=friends");
    const crew = page.locator("#workspace section.crew");
    await expect(crew.getByRole("heading", { name: "Crew match" })).toBeVisible({ timeout: 20_000 });
    await crew.locator("summary").click(); // folded by default
    return crew;
  }

  test("no shared history: the locked copy, never a number", async ({ browser, page, context, baseURL }) => {
    const me = await signInAsMember(context, baseURL!, `Crew ${Date.now()}`);
    const other = await browser.newContext();
    try {
      const pal = await signInAsMember(other, baseURL!, `Pal ${Date.now()}`);
      await friends(me, pal);
      const crew = await openCrew(page);
      await expect(crew.locator(".crew__locked")).toContainText("3 more plans together");
      await expect(crew.locator(".crew__dots span[data-done]")).toHaveCount(0);
      await expect(crew.locator(".crew__score")).toHaveCount(0);
      expect(await crew.innerText()).not.toMatch(/\d+%/);
    } finally {
      await other.close();
    }
  });

  test("three shared kinds of place and a decided plan together: a score and a streak", async ({ browser, page, context, baseURL }) => {
    const admin = localAdmin();
    const me = await signInAsMember(context, baseURL!, `Crew ${Date.now()}`);
    const other = await browser.newContext();
    const planId = randomUUID();
    try {
      const pal = await signInAsMember(other, baseURL!, `Pal ${Date.now()}`);
      await friends(me, pal);

      // One curated place in each of four kinds: I've been to all four, they've been to three.
      const { data: rows } = await admin.from("spots").select("id, category").eq("source", "curated").order("id");
      const kinds = [...new Map((rows ?? []).map((r) => [r.category, r.id])).values()].slice(0, 4);
      expect(kinds).toHaveLength(4);
      const visits = [...kinds.map((spot) => ({ person_id: me.userId, spot_id: spot })), ...kinds.slice(0, 3).map((spot) => ({ person_id: pal.userId, spot_id: spot }))];
      expect((await admin.from("visits").insert(visits)).error).toBeNull();

      // A decided plan yesterday that we both went to: this month's streak.
      const yesterday = new Date(Date.now() - 86_400_000).toISOString();
      expect((await admin.from("plans").insert({ id: planId, title: "Crew night", category: "dinner", area: "Jumeirah", status: "decided", stage: "decided", pool_count: 1, winner_spot_id: kinds[0], event_time: yesterday, decided_at: yesterday, created_by_user_id: me.userId })).error).toBeNull();
      expect((await admin.from("plan_host_tokens").insert({ plan_id: planId, token_hash: randomBytes(32).toString("hex") })).error).toBeNull();
      expect((await admin.from("plan_access").insert([{ plan_id: planId, user_id: me.userId }, { plan_id: planId, user_id: pal.userId }])).error).toBeNull();
      expect((await admin.from("visits").insert([me, pal].map((m) => ({ person_id: m.userId, spot_id: kinds[0], plan_id: planId })))).error).toBeNull();

      const crew = await openCrew(page);
      // Kinds: 3 shared of 4 between us, and the only part with enough behind it.
      await expect(crew.locator(".crew__score strong")).toHaveText("75%");
      await expect(crew.locator(".crew__parts li")).toHaveCount(1);
      await expect(crew.locator(".crew__parts li")).toContainText("Kinds of place");
      await expect(crew.locator(".crew__streak")).toHaveText(/^\d+-month streak since [A-Z][a-z]+ \d{4}/);
    } finally {
      await admin.from("plans").delete().eq("id", planId);
      await other.close();
    }
  });

  test("someone who is no longer a friend never gets a number: the card says it couldn't load", async ({ browser, page, context, baseURL }) => {
    const admin = localAdmin();
    const me = await signInAsMember(context, baseURL!, `Crew ${Date.now()}`);
    const others = [await browser.newContext(), await browser.newContext()];
    try {
      const [a, b] = [await signInAsMember(others[0], baseURL!, `Aya ${Date.now()}`), await signInAsMember(others[1], baseURL!, `Bo ${Date.now()}`)];
      await friends(me, a);
      await friends(me, b);
      const crew = await openCrew(page);
      await expect(crew.locator(".crew__locked, .crew__ready")).toBeVisible({ timeout: 20_000 });

      // Unfriend whichever chip isn't open, then open it: the server refuses (42501).
      const idle = crew.getByRole("group", { name: "Friend" }).locator('button[aria-pressed="false"]').first();
      const name = await idle.innerText();
      const gone = name === a.name ? a : b;
      for (const [x, y] of [[me, gone], [gone, me]]) {
        expect((await admin.from("friendships").delete().eq("person_id", x.userId).eq("friend_id", y.userId)).error).toBeNull();
      }
      await idle.click();
      await expect(crew.getByRole("alert")).toHaveText(`Couldn’t load your match with ${name} right now.`);
      await expect(crew.locator(".crew__score, .crew__locked")).toHaveCount(0);
      expect(await crew.innerText()).not.toMatch(/\d+%/);
    } finally {
      await Promise.all(others.map((c) => c.close()));
    }
  });
});
