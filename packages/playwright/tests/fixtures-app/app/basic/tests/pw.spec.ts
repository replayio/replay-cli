import { test, expect } from "@playwright/test";

const testName = __dirname.split("/").slice(-2)[0];

test("smoke", async ({ page }) => {
  await page.goto(`http://localhost:3000/${testName}`);
  const title = page.locator("#docs-card p");
  await expect(title).toHaveText("Find in-depth information about Next.js features and API.");
});
