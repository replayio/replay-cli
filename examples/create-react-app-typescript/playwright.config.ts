import { devices as replayDevices } from "@replayio/playwright";

const config = {
  forbidOnly: !!process.env.CI,
  use: {
    trace: "on-first-retry",
    defaultBrowserType: "firefox",
  },
  webServer: {
    command: "npm start",
    port: 3000,
    timeout: 30 * 1000,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: "replay-firefox",
      use: {
        ...(replayDevices["Replay Firefox"] as any),
      },
    },
  ],
};

module.exports = config;
