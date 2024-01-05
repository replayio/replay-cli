import { BrowserName, ensurePlaywrightBrowsersInstalled } from "@replayio/replay";

function isValidBrowser(browserName: string): browserName is BrowserName | "all" {
  return ["chromium", "all"].includes(browserName);
}

async function install(browser: string) {
  if (isValidBrowser(browser)) {
    await ensurePlaywrightBrowsersInstalled(browser, { verbose: true });
  } else {
    console.error("Browser", browser, "is not supported");
  }
}

export default install;
