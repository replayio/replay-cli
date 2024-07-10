import { logger } from "@replay-cli/shared/logger";
import { installLatestRuntimeRelease } from "@replay-cli/shared/runtime/installLatestRuntimeRelease";
import { name, version } from "../package.json";
import { getAccessToken } from "@replay-cli/shared/authentication/getAccessToken";

export default async function install() {
  try {
    logger.initialize(name, version);
    const accessToken = await getAccessToken();
    await logger.identify(accessToken.accessToken);
  } catch (error) {
    logger.error("Failed to identify for logger", { error });
  }

  try {
    await installLatestRuntimeRelease();
  } finally {
    await logger.close();
  }
}
