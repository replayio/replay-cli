import { getPlaywrightBrowserPath, BrowserName } from "@replayio/replay";
import { getDirectory } from "@replayio/replay/src/utils";
import path from "path";

function getDeviceConfig(browserName: BrowserName) {
  const executablePath = getExecutablePath(browserName);
  if (!executablePath) {
    console.warn(`${browserName} is not supported on this platform`);
  }

  const env: Record<string, any> = {
    ...process.env,
    RECORD_ALL_CONTENT: 1,
  };

  // When TEST_WORKER_INDEX is set, this is being run in the context of a
  // @playwright/test worker so we create a per-worker metadata file that can be
  // used by the reporter to inject test-specific metadata which will be picked
  // up by the driver when it creates a new recording
  if (process.env.TEST_WORKER_INDEX) {
    const workerIndex = +(process.env.TEST_WORKER_INDEX || 0);
    env.RECORD_REPLAY_METADATA = undefined;
    env.RECORD_REPLAY_METADATA_FILE = getMetadataFilePath(workerIndex);
  }

  return {
    launchOptions: {
      executablePath,
      env,
    },
    defaultBrowserType: browserName,
  };
}

export function getMetadataFilePath(workerIndex = 0) {
  return path.join(getDirectory(), `PLAYWRIGHT_METADATA_${workerIndex}`);
}

export function getExecutablePath(browserName: BrowserName) {
  return getPlaywrightBrowserPath(browserName);
}

export const devices = {
  get "Replay Firefox"() {
    return getDeviceConfig("firefox");
  },
  get "Replay Chromium"() {
    return getDeviceConfig("chromium");
  },
};
