import type { Page, Locator } from "@playwright/test";

/**
 * Takes a screenshot of a component with automatic bounds detection and padding
 * @param component - The mounted component locator
 * @param page - The Playwright page instance
 * @param filename - The filename for the screenshot
 * @param padding - Padding around the component (default: 20px)
 */
export async function takeComponentScreenshot(
  component: Locator,
  page: Page,
  filename: string,
  padding = 20
): Promise<void> {
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

/**
 * Waits for animations to complete
 * @param page - The Playwright page instance
 * @param duration - Duration to wait in milliseconds (default: 300ms)
 */
export async function waitForAnimations(page: Page, duration = 300): Promise<void> {
  await page.waitForTimeout(duration);
}

/**
 * Takes a full component screenshot for visual regression testing
 * @param component - The mounted component locator
 * @param filename - The filename for the screenshot
 */
export async function takeVisualRegressionScreenshot(
  component: Locator,
  filename: string
): Promise<void> {
  await component.screenshot({ path: filename });
}

/**
 * Utility to test component states with screenshots
 * @param component - The mounted component locator
 * @param page - The Playwright page instance
 * @param states - Array of state configurations with actions and screenshot names
 */
export async function testComponentStates(
  component: Locator,
  page: Page,
  states: Array<{
    name: string;
    action?: () => Promise<void>;
    waitTime?: number;
  }>
): Promise<void> {
  for (const state of states) {
    if (state.action) {
      await state.action();
    }

    if (state.waitTime) {
      await page.waitForTimeout(state.waitTime);
    }

    await takeComponentScreenshot(component, page, `test-results/component-${state.name}.png`);
  }
}
