import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";

export default mergeConfig(
  viteConfig,
  defineConfig({
    plugins: [storybookTest()],
    test: {
      name: "storybook",
      browser: {
        enabled: true,
        provider: "playwright",
        instances: [
          {
            browser: "chromium",
            headless: true,
          },
        ],
      },
      setupFiles: ["./.storybook/vitest.setup.ts"],
    },
  })
);
