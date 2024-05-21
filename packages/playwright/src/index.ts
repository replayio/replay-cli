import { getPlaywrightBrowserPath } from "@replayio/replay";
import { initMetadataFile } from "@replayio/test-utils";

import { addReplayFixture } from "./fixture";
import { getMetadataFilePath, ReplayPlaywrightConfig } from "./reporter";

function getDeviceConfig() {
  const executablePath = getExecutablePath();

  const env: Record<string, any> = {
    ...process.env,
    RECORD_ALL_CONTENT: 1,
  };

  if (process.env.RECORD_REPLAY_NO_RECORD) {
    env.RECORD_ALL_CONTENT = "";
    env.RECORD_REPLAY_DRIVER = __filename;
  }

  // When TEST_WORKER_INDEX is set, this is being run in the context of a
  // @playwright/test worker so we create a per-worker metadata file that can be
  // used by the reporter to inject test-specific metadata which will be picked
  // up by the driver when it creates a new recording
  if (process.env.TEST_WORKER_INDEX) {
    const workerIndex = +(process.env.TEST_WORKER_INDEX || 0);
    const path = getMetadataFilePath(workerIndex);
    env.RECORD_REPLAY_METADATA = undefined;
    env.RECORD_REPLAY_METADATA_FILE = initMetadataFile(path);
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
    defaultBrowserType: "chromium",
  };
}

export function getExecutablePath() {
  return getPlaywrightBrowserPath("chromium");
}

export const devices = {
  get "Replay Chromium"() {
    return getDeviceConfig();
  },
};

export function replayReporter(config: ReplayPlaywrightConfig = {}) {
  // intentionally produce a mutable array here with the help of satisfies
  // this has to be kept for a foreseeable future to keep compat with older Playwright versions
  // even after the fix for this gets released: https://github.com/microsoft/playwright/pull/30387
  return ["@replayio/playwright/reporter", config] as const satisfies unknown[];
}

/** @deprecated use `replayReporter` instead */
export const createReplayReporterConfig = replayReporter;

export { getMetadataFilePath };
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
