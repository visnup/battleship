import { expect, test } from "@playwright/test";

// Every card's look against a stored screenshot. After a deliberate change, look at /test/cards,
// then rerun with --update-snapshots.

test("every card looks as it did", async ({ page }) => {
  await page.goto("/test/cards");
  await expect(page).toHaveScreenshot({ fullPage: true });
});
