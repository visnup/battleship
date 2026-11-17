import { expect, test } from "@playwright/test";
import { randomUUID } from "crypto";

// Needs pnpm dev, Convex included.

test("deals a game against a bot", async ({ page }) => {
  await page.goto(`/${randomUUID()}`);
  await page.getByRole("button", { name: "Deal 2 players" }).click();
  await expect(page.getByText(/Your turn|Waiting for/)).toBeVisible();
  await expect(page.getByRole("heading", { name: /^You/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Bot/ })).toBeVisible();
});

test("two people at one table each see the game", async ({ browser }) => {
  const table = randomUUID();
  const [a, b] = await Promise.all([browser.newPage(), browser.newPage()]);
  await a.goto(`/${table}`);
  await b.goto(`/${table}`);
  await expect(a.getByText("Player 2")).toBeVisible();
  await a.getByRole("button", { name: "−" }).click();
  await a.getByRole("button", { name: "Deal 2 players" }).click();
  for (const page of [a, b]) await expect(page.getByText(/Your turn|Waiting for Player/)).toBeVisible();
});
