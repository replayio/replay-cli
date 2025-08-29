import { test as base, expect } from "@replayio/playwright-ct";
import type { Locator } from "@playwright/test";
import {
  takeComponentScreenshot,
  waitForAnimations,
  takeVisualRegressionScreenshot,
  testComponentStates,
} from "./screenshot-helpers";

// Define types for our custom fixtures
type ComponentTestFixtures = {
  takeComponentScreenshot: typeof takeComponentScreenshot;
  waitForAnimations: typeof waitForAnimations;
  takeVisualRegressionScreenshot: typeof takeVisualRegressionScreenshot;
  testComponentStates: typeof testComponentStates;
  enhancedMount: (component: React.JSX.Element) => Promise<
    Locator & {
      takeScreenshot: (filename: string, padding?: number) => Promise<void>;
      takeVisualSnapshot: (filename: string) => Promise<void>;
    }
  >;
};

// Extend the base test to include custom fixtures
export const test = base.extend<ComponentTestFixtures>({
  // Add screenshot utilities as fixtures
  takeComponentScreenshot: async (_, wrap) => {
    await wrap(takeComponentScreenshot);
  },

  waitForAnimations: async (_, wrap) => {
    await wrap(waitForAnimations);
  },

  takeVisualRegressionScreenshot: async (_, wrap) => {
    await wrap(takeVisualRegressionScreenshot);
  },

  testComponentStates: async (_, wrap) => {
    await wrap(testComponentStates);
  },

  // Enhanced mount fixture with built-in screenshot capabilities
  enhancedMount: async ({ mount, page }, wrap) => {
    const enhancedMountWithScreenshot = async (component: React.JSX.Element) => {
      const mounted = await mount(component);

      // Add screenshot methods to the mounted component using Object.assign
      const enhancedMounted = Object.assign(mounted, {
        takeScreenshot: async (filename: string, padding = 20) => {
          return takeComponentScreenshot(mounted, page, filename, padding);
        },

        takeVisualSnapshot: async (filename: string) => {
          return takeVisualRegressionScreenshot(mounted, filename);
        },
      });

      return enhancedMounted;
    };
    await wrap(enhancedMountWithScreenshot);
  },
});

export { expect };
