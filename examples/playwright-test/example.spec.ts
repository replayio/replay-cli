import { test, expect } from "@playwright/test";

test("basic test", async ({ page }) => {
  await page.goto("https://replay.io/");
  const title = page.locator(".header-home-heading h1");
  await expect(title).toHaveText("Your time travel debugger");
});
