import { setupReplayConfig } from "./playwright";

describe("setupReplayConfig", () => {
  it("should add Replay configurations correctly for ES module syntax", () => {
    const source = `
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [['line'], ['html', { open: 'never' }]],

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    trace: 'on-first-retry'
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'yarn dev',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI
  }
})
`;
    const transformedSource = setupReplayConfig(source);
    expect(transformedSource).toMatchSnapshot();
  });

  it("should add Replay configurations correctly for CommonJS syntax", () => {
    const source = `
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [['line'], ['html', { open: 'never' }]],

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    trace: 'on-first-retry'
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'yarn dev',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI
  }
});
`;
    const transformedSource = setupReplayConfig(source);
    expect(transformedSource).toMatchSnapshot();
  });

  it("should handle existing Replay configurations gracefully", () => {
    const source = `
import { devices as replayDevices } from '@replayio/playwright';
import { test, expect } from '@playwright/test';

export default defineConfig({
  reporter: [
    ["@replayio/playwright/reporter", { apiKey: process.env.REPLAY_API_KEY, upload: true }],
    // Other reporters...
  ],
  projects: [
    {
      name: 'replay-chromium',
      use: { ...replayDevices["Replay Chromium"] },
    },
    // Other projects...
  ],
});
`;
    expect(() => setupReplayConfig(source)).toThrow(
      "Replay imports already exist in the playwright.config.ts file."
    );
  });
});
