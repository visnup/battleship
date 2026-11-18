import { expect, test } from "@playwright/test";
import { randomUUID } from "crypto";

// Needs pnpm dev, Convex included.

test("deals a game against a bot", async ({ page }) => {
  await page.goto(`/${randomUUID()}`);
  await page.getByRole("button", { name: "Deal 2 players" }).click();
  await expect(page.getByText(/plays? left|Waiting for/)).toBeVisible();
  await expect(page.getByRole("heading", { name: /^You/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Bot/ })).toBeVisible();
});

test("two people at one table each see the game", async ({ browser }) => {
  const table = randomUUID();
  const [a, b] = await Promise.all([browser.newPage(), browser.newPage()]);
  await a.goto(`/${table}`);
  await b.goto(`/${table}`);
  await expect(a.getByText("Player 2")).toBeVisible({ timeout: 10e3 });
  await a.getByRole("button", { name: "−" }).click();
  await a.getByRole("button", { name: "Deal 2 players" }).click();
  for (const page of [a, b]) await expect(page.getByText(/plays? left|Waiting for Player/)).toBeVisible();
});

test("a sixth visitor to a full table watches", async ({ browser }) => {
  const table = randomUUID();
  const pages = await Promise.all(Array.from({ length: 5 }, () => browser.newPage()));
  for (const page of pages) await page.goto(`/${table}`);
  await expect(pages[0].getByText("Player 5")).toBeVisible({ timeout: 10e3 });
  await pages[0].getByRole("button", { name: "−" }).click();
  await pages[0].getByRole("button", { name: "Deal 5 players" }).click();
  const watcher = await browser.newPage();
  await watcher.goto(`/${table}`);
  await expect(watcher.getByText("you're watching")).toBeVisible();
  await expect(watcher.getByRole("heading", { name: /^Player 1/ })).toBeVisible();
});

test("a name typed in the lobby shows to the others, and on the board", async ({ browser }) => {
  const table = randomUUID();
  const [a, b] = await Promise.all([browser.newPage(), browser.newPage()]);
  await a.goto(`/${table}`);
  await b.goto(`/${table}`);
  await a.getByLabel("Your name").fill("Ada");
  await expect(b.getByText("Ada")).toBeVisible({ timeout: 10e3 });
  await b.getByRole("button", { name: "−" }).click();
  await b.getByRole("button", { name: "Deal 2 players" }).click();
  await expect(b.getByRole("heading", { name: /^Ada/ })).toBeVisible();
});
