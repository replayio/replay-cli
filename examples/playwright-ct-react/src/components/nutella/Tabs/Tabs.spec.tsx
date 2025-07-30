import { test, expect } from "@replayio/playwright-ct";
import Tabs from "./Tabs";

const defaultTabs = [
  { id: "world", label: "World" },
  { id: "ny", label: "N.Y." },
  { id: "business", label: "Business" },
  { id: "arts", label: "Arts" },
  { id: "science", label: "Science" },
];

// Helper function to take screenshots with automatic component bounds
async function takeComponentScreenshot(component: any, page: any, filename: string, padding = 20) {
  const bounds = await component.boundingBox();
  if (bounds) {
    await page.screenshot({
      path: filename,
      clip: {
        x: Math.max(0, bounds.x - padding),
        y: Math.max(0, bounds.y - padding),
        width: bounds.width + padding * 2,
        height: bounds.height + padding * 2,
      },
    });
  }
}

test.describe("Tabs Component with Video Recording", () => {
  // This test will be recorded as video due to our config
  test("tab switching animation with video capture", async ({ mount, page }) => {
    const component = await mount(
      <div className="p-8 w-fit">
        <Tabs tabs={defaultTabs} />
      </div>
    );

    // Check that all tabs are rendered (video recording happens automatically)
    await expect(component.getByTestId("tabs-container")).toBeVisible();
    await expect(component.getByTestId("tab-world")).toBeVisible();

    // Take initial screenshot using component bounds
    await takeComponentScreenshot(component, page, "test-results/tabs-initial.png");

    // Check that first tab is active by default
    await expect(component.getByTestId("tab-world")).toHaveAttribute("data-active", "true");

    // Click through each tab with screenshots
    const tabs = ["tab-ny", "tab-business", "tab-arts", "tab-science"];

    for (let i = 0; i < tabs.length; i++) {
      await component.getByTestId(tabs[i]).click();

      // Wait for animation to complete
      await page.waitForTimeout(300); // Reduced wait time

      // Take screenshot using component bounds
      await takeComponentScreenshot(component, page, `test-results/tabs-${tabs[i]}-active.png`);

      await expect(component.getByTestId(tabs[i])).toHaveAttribute("data-active", "true");
    }

    // Final visual regression test
    await expect(component).toHaveScreenshot("tabs-final-state.png");

    // Video is automatically saved by Playwright config - no manual saving needed
  });

  test("tab animation timing test", async ({ mount, page }) => {
    const component = await mount(
      <div className="p-8 w-fit">
        <Tabs tabs={defaultTabs} />
      </div>
    );

    // Test rapid clicking to ensure animations work properly
    await component.getByTestId("tab-business").click();
    await page.waitForTimeout(50);
    await component.getByTestId("tab-arts").click();
    await page.waitForTimeout(50);
    await component.getByTestId("tab-science").click();

    // Wait for all animations to settle
    await page.waitForTimeout(400);

    // Screenshot final state using component bounds
    await takeComponentScreenshot(component, page, "test-results/tabs-rapid-clicking-final.png");

    await expect(component.getByTestId("tab-science")).toHaveAttribute("data-active", "true");
  });
});
