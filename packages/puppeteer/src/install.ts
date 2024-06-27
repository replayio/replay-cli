import { initLogger, logger } from "@replay-cli/shared/logger";
import { installLatestRuntimeRelease } from "@replay-cli/shared/runtime/installLatestRuntimeRelease";

export default async function install() {
  initLogger("puppeteer");
  try {
    await installLatestRuntimeRelease();
  } finally {
    await logger.close();
  }
}
