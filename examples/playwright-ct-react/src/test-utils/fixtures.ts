import { test as base, expect } from '@replayio/playwright-ct';
import type { Locator } from '@playwright/test';
import { 
  takeComponentScreenshot, 
  waitForAnimations, 
  takeVisualRegressionScreenshot,
  testComponentStates 
} from './screenshot-helpers';

// Define types for our custom fixtures
type ComponentTestFixtures = {
  takeComponentScreenshot: typeof takeComponentScreenshot;
  waitForAnimations: typeof waitForAnimations;
  takeVisualRegressionScreenshot: typeof takeVisualRegressionScreenshot;
  testComponentStates: typeof testComponentStates;
  enhancedMount: (component: any) => Promise<Locator & {
    takeScreenshot: (filename: string, padding?: number) => Promise<void>;
    takeVisualSnapshot: (filename: string) => Promise<void>;
  }>;
};

// Extend the base test to include custom fixtures
export const test = base.extend<ComponentTestFixtures>({
  // Add screenshot utilities as fixtures
  takeComponentScreenshot: async ({}, use) => {
    await use(takeComponentScreenshot);
  },
  
  waitForAnimations: async ({}, use) => {
    await use(waitForAnimations);
  },
  
  takeVisualRegressionScreenshot: async ({}, use) => {
    await use(takeVisualRegressionScreenshot);
  },
  
  testComponentStates: async ({}, use) => {
    await use(testComponentStates);
  },
  
  // Enhanced mount fixture with built-in screenshot capabilities
  enhancedMount: async ({ mount, page }, use) => {
    const enhancedMountWithScreenshot = async (component: any) => {
      const mounted = await mount(component);
      
      // Add screenshot methods to the mounted component using Object.assign
      const enhancedMounted = Object.assign(mounted, {
        takeScreenshot: async (filename: string, padding = 20) => {
          return takeComponentScreenshot(mounted, page, filename, padding);
        },
        
        takeVisualSnapshot: async (filename: string) => {
          return takeVisualRegressionScreenshot(mounted, filename);
        }
      });
      
      return enhancedMounted;
    };
    
    await use(enhancedMountWithScreenshot);
  }
});

export { expect }; 