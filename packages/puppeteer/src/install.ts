import { logger } from "@replay-cli/shared/logger";
import { installLatestRuntimeRelease } from "@replay-cli/shared/runtime/installLatestRuntimeRelease";
import { name, version } from "../package.json";

export default async function install() {
  logger.initialize(name, version);
  try {
    await installLatestRuntimeRelease();
  } finally {
    await logger.close();
  }
}
