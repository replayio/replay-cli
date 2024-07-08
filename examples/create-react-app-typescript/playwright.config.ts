import { defineConfig } from "@playwright/test";
import { devices as replayDevices, replayReporter } from "@replayio/playwright";

export default defineConfig({
  forbidOnly: !!process.env.CI,
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
  reporter: [["./customReporter.js"]],
  projects: [
    {
      name: "replay-chromium",
      use: {
        ...replayDevices["Replay Chromium"],
      },
    },
  ],
});
