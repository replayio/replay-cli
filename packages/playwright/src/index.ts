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

  if (process.env.TEST_WORKER_INDEX && !("RECORD_REPLAY_METADATA" in env)) {
    env.RECORD_REPLAY_METADATA_FILE = getMetadataFilePath(+process.env.TEST_WORKER_INDEX);
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
