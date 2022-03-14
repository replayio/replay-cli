import {
  getPlaywrightBrowserPath,
  BrowserName,
} from "@recordreplay/recordings-cli";

function getDeviceConfig(browserName: BrowserName) {
  const executablePath = getPlaywrightBrowserPath(browserName);
  if (!executablePath) {
    console.warn(`${browserName} is not supported on this platform`);
  }

  return {
    launchOptions: {
      executablePath,
      env: {
        RECORD_ALL_CONTENT: 1,
      },
    },
    defaultBrowserType: browserName,
  };
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
