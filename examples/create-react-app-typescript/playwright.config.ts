import { defineConfig } from "@playwright/test";
import { devices as replayDevices } from "@replayio/playwright";

export default defineConfig({
  forbidOnly: !!process.env.CI,
  globalSetup: require.resolve("./global.setup.js"),
  use: {
    trace: "on-first-retry",
    defaultBrowserType: "chromium",
  },
  webServer: {
    command: "yarn run start",
    port: 3000,
    timeout: 30 * 1000,
    reuseExistingServer: !process.env.CI,
  },
  reporter: [
    [
      "@replayio/playwright/reporter",
      {
        apiKey: process.env.REPLAY_API_KEY || process.env.RECORD_REPLAY_API_KEY,
        upload: true,
      },
    ],
    // replicating Playwright's defaults
    process.env.CI ? (["dot"] as const) : (["list"] as const),
  ],
  projects: [
    {
      name: "replay-chromium",
      use: {
        ...replayDevices["Replay Chromium"],
      },
    },
  ],
});
