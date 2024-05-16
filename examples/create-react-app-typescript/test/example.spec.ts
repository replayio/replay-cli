import { test, expect } from "@playwright/test";

test("basic test", async ({ page }) => {
  await page.goto("http://localhost:3000/");
  const title = page.locator(".App p");
  await expect(title).toHaveText("Edit App.tsx and save to reload.");
});
