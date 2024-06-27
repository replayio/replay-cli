import { installLatestRuntimeRelease } from "@replay-cli/shared/runtime/installLatestRuntimeRelease";
import { logger } from "@replay-cli/shared/runtime/logger";

async function install() {
  try {
    await installLatestRuntimeRelease();
  } finally {
    await logger.close();
  }
}

export default install;
