import {
  BrowserName,
  ensurePlaywrightBrowsersInstalled,
} from "@replayio/replay";

function isValidBrowser(
  browserName: string
): browserName is BrowserName | "all" {
  return ["chromium", "firefox", "all"].includes(browserName);
}

async function install(browser: string) {
  if (isValidBrowser(browser)) {
    await ensurePlaywrightBrowsersInstalled(browser);
  } else {
    console.error("Browser", browser, "is not supported");
  }
}

export default install;
