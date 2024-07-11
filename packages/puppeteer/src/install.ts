import { logError } from "@replay-cli/shared/logger";
import { waitForExitTasks } from "@replay-cli/shared/process/waitForExitTasks";
import { installLatestRuntimeRelease } from "@replay-cli/shared/runtime/installLatestRuntimeRelease";
import { initializeSession } from "@replay-cli/shared/session/initializeSession";
import { getAccessToken } from "@replayio/test-utils";
import { name as packageName, version as packageVersion } from "../package.json";

export default async function install() {
  try {
    await initializeSession({
      accessToken: getAccessToken(),
      packageName,
      packageVersion,
    });
  } catch (error) {
    logError("Failed to identify for logger", { error });
  }

  try {
    await installLatestRuntimeRelease();
  } finally {
    await waitForExitTasks();
  }
}
