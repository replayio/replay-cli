import { ensurePuppeteerBrowsersInstalled } from "@kitchensink-replayio/replay";

async function install() {
  await ensurePuppeteerBrowsersInstalled("chromium", { verbose: true });
}

export default install;
