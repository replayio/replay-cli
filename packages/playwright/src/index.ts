import { getPlaywrightBrowserPath, BrowserName } from "@replayio/replay";
import { initMetadataFile } from "@replayio/test-utils";

import { getMetadataFilePath } from "./reporter";
import { addReplayFixture, isFixtureEnabled, replayFixture } from "./fixture";

if (isFixtureEnabled()) {
  addReplayFixture();
}

function getDeviceConfig(browserName: BrowserName) {
  const executablePath = getExecutablePath(browserName);

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
          throw new Error(`${browserName} is not supported on this platform`);
        }

        return executablePath;
      },
      env,
    },
    defaultBrowserType: browserName,
  };
}

export function getExecutablePath(browserName: BrowserName) {
  return getPlaywrightBrowserPath(browserName);
}

export const devices = {
  get "Replay Chromium"() {
    return getDeviceConfig("chromium");
  },
};

export { getMetadataFilePath, replayFixture, addReplayFixture };
