import { initLogger, logger } from "@replay-cli/shared/logger";
import { installLatestRuntimeRelease } from "@replay-cli/shared/runtime/installLatestRuntimeRelease";

async function install() {
  initLogger("puppeteer");
  await installLatestRuntimeRelease();
  await logger.close().catch(() => {});
}

export default install;
