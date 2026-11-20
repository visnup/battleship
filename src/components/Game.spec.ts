import { expect, test } from "@playwright/test";
import { randomUUID } from "crypto";

// Needs pnpm dev, Convex included.

test("deals a game against three bots", async ({ page }) => {
  await page.goto(`/${randomUUID()}`);
  await page.getByRole("button", { name: "Deal 4 players" }).click();
  await expect(page.getByRole("heading", { name: /^You/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Bot/ })).toHaveCount(3);
});

test("plays a whole game by taking the Hint", async ({ page }) => {
  test.setTimeout(180e3);
  await page.goto(`/${randomUUID()}`);
  await page.getByRole("button", { name: "Remove bot" }).first().click();
  await page.getByRole("button", { name: "Deal 3 players" }).click();
  const over = page.getByText(/ won!$| share the win\.$/);
  while (!(await over.isVisible())) {
    for (const name of [/^Skip$/, /^Continue$/, /^Hint$/, /^Play /]) {
      const button = page.getByRole("button", { name }).first();
      if (await button.isVisible()) await button.click();
    }
    await page.waitForTimeout(100);
  }
  await expect(over).toBeVisible();
});

test("two people at one table each see the game", async ({ browser }) => {
  const table = randomUUID();
  const [a, b] = await Promise.all([browser.newPage(), browser.newPage()]);
  await a.goto(`/${table}`);
  await b.goto(`/${table}`);
  await expect(a.getByText("Player 2")).toBeVisible({ timeout: 10e3 });
  await a.getByRole("button", { name: "Remove bot" }).first().click();
  await a.getByRole("button", { name: "Deal 4 players" }).click();
  for (const page of [a, b]) await expect(page.getByRole("heading", { name: /^You/ })).toBeVisible();
});
