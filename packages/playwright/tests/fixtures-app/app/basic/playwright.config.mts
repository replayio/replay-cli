import { defineConfig } from "@playwright/test";
import { devices as replayDevices, replayReporter } from "@replayio/playwright";

export default defineConfig({
  globalSetup: "../_pw-utils/network-mock-global-setup.ts",
  reporter: [
    ["line"],
    replayReporter({
      upload: true,
      apiKey: "MOCKED_API_KEY",
    }),
  ],
  projects: [
    {
      name: "replay-chromium",
      use: { ...replayDevices["Replay Chromium"] },
    },
  ],
});
