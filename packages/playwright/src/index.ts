import { getRuntimePath } from "@replay-cli/shared/runtime/getRuntimePath";
import { initMetadataFile } from "@replayio/test-utils";

import { addReplayFixture, metadataFilePath } from "./fixture";
import { ReplayPlaywrightConfig } from "./reporter";

function getDeviceConfig() {
  const executablePath = getExecutablePath();

  const env: Record<string, any> = {
    ...process.env,
    RECORD_ALL_CONTENT: 1,
    RECORD_REPLAY_ENABLE_ASSERTS: process.env.RECORD_REPLAY_ENABLE_ASSERTS,
    // it doesn't log anything eagerly but it makes it possible to enable verbose logs with DEBUG=pw:browser
    RECORD_REPLAY_VERBOSE: 1,
    RECORD_REPLAY_METADATA: undefined,
    RECORD_REPLAY_METADATA_FILE: initMetadataFile(metadataFilePath),
  };

  if (process.env.RECORD_REPLAY_NO_RECORD) {
    env.RECORD_ALL_CONTENT = "";
    env.RECORD_REPLAY_DRIVER = __filename;
  }

  return {
    launchOptions: {
      get executablePath() {
        if (!executablePath) {
          throw new Error(`replay-chromium is not supported on this platform`);
        }

        return executablePath;
      },
      env,
    },
    defaultBrowserType: "chromium" as const,
  };
}

export function getExecutablePath() {
  return getRuntimePath();
}

export const devices = {
  get "Replay Chromium"() {
    return getDeviceConfig();
  },
};

export function replayReporter(config: ReplayPlaywrightConfig = {}) {
  return ["@replayio/playwright/reporter", config] as const;
}

export type { ReplayPlaywrightConfig };

// ⚠️ this is an initialization-time side-effect
// there is no other way to add this fixture reliably to make it available automatically
//
// `globalSetup` doesn't work because this has to be executed in a worker context
// and `globalSetup` is executed in the worker's parent process
//
// project dependencies can't be used because they can't execute files from node_modules
// but since setup/teardown is done using `test` when using this strategy
// it would likely be too late for this to be added there anyway
//
// currently this works somewhat accidentally, it only works because Playwright workers load config files
// if the config would be serialized and passed down to them from the parent it wouldn't work
addReplayFixture();
