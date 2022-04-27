import { ensurePuppeteerBrowsersInstalled } from "@replayio/replay";

async function install() {
  await ensurePuppeteerBrowsersInstalled("chromium");
}

export default install;
