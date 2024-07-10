import { logger } from "@replay-cli/shared/logger";
import { installLatestRuntimeRelease } from "@replay-cli/shared/runtime/installLatestRuntimeRelease";
import { initializeSession } from "@replay-cli/shared/session/initializeSession";
import { getAccessToken } from "@replayio/test-utils";
import { name as packageName, version as packageVersion } from "../package.json";

export default async function install() {
  try {
    initializeSession({
      accessToken: getAccessToken(),
      packageName,
      packageVersion,
    });
  } catch (error) {
    logger.error("Failed to identify for logger", { error });
  }

  try {
    await installLatestRuntimeRelease();
  } finally {
    await logger.close();
  }
}
