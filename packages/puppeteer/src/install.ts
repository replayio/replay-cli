import { initLogger, logger } from "@replay-cli/shared/logger";
import { installLatestRuntimeRelease } from "@replay-cli/shared/runtime/installLatestRuntimeRelease";

async function install() {
  initLogger("puppeteer");
  try {
    await installLatestRuntimeRelease();
  } finally {
    await logger.close();
  }
}

export default install;
