import { getBrowserPath } from "@replay-cli/shared/runtime/getBrowserPath";
import {
  getMetadataFilePath as getMetadataFilePathBase,
  initMetadataFile,
} from "@replayio/test-utils";

function getDeviceConfig() {
  const executablePath = getExecutablePath();

  const env: Record<string, any> = {
    ...process.env,
    RECORD_ALL_CONTENT: 1,
    RECORD_REPLAY_METADATA_FILE: initMetadataFile(getMetadataFilePath()),
  };

  if (process.env.RECORD_REPLAY_NO_RECORD) {
    env.RECORD_ALL_CONTENT = "";
    // Setting an invalid path for chromium will disable recording
    env.RECORD_REPLAY_DRIVER = __filename;
  }

  return {
    launchOptions: {
      executablePath,
      env,
    },
    defaultBrowserType: "chromium",
  };
}

export function getMetadataFilePath(workerIndex = 0) {
  return getMetadataFilePathBase("PUPPETEER", workerIndex);
}

export function getExecutablePath() {
  return getBrowserPath();
}

export const devices = {
  get "Replay Chromium"() {
    return getDeviceConfig();
  },
};
