import { test, expect } from "@playwright/test";

test("basic test", async ({ page }) => {
  await page.goto("http://localhost:3000/");
  const title = page.locator(".App p");
  await expect(title).toHaveText("Edit src/App.tsx and save to reload!");
});

test("basic test 2", async ({ page }) => {
  await page.goto("http://localhost:3000/");
  const title = page.locator(".App p");
  await expect(title).toHaveText("Edit src/App.tsx and save to reload.");
});

test("basic test 3", async ({ page }) => {
  await page.goto("http://localhost:3000/");
  const title = page.locator(".App p");
  await expect(title).toHaveText("Edit src/App.tsx and save to reload.");
});


test("basic test 4", async ({ page }) => {
  await page.goto("http://localhost:3000/");
  const title = page.locator(".App p");
  await expect(title).toHaveText("Edit src/App.tsx and save to reload.");
});


test("basic test 5", async ({ page }) => {
  await page.goto("http://localhost:3000/");
  const title = page.locator(".App p");
  await expect(title).toHaveText("Edit src/App.tsx and save to reload.");
});
