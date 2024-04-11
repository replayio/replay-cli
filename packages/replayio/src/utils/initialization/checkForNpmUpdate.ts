import { version as currentVersion, name as packageName } from "../../../package.json";
import { shouldPrompt } from "../prompt/shouldPrompt";
import { debug } from "./debug";
import { getLatestPackageVersion } from "./getLatestPackageVersion";
import { getPackageManagerCommand } from "./getPackageManagerCommand";
import { UpdateCheck } from "./types";

const PROMPT_ID = "npm-update";

export async function checkForNpmUpdate(): Promise<UpdateCheck<string>> {
  try {
    const command = getPackageManagerCommand();
    if (command) {
      const latestVersion = await getLatestPackageVersion(command, packageName);

      return {
        hasUpdate: currentVersion !== latestVersion,
        fromVersion: currentVersion,
        shouldShowPrompt: shouldPrompt({
          id: PROMPT_ID,
          metadata: latestVersion,
        }),
        toVersion: latestVersion,
      };
    }
  } catch (error) {
    debug("Failed to check for npm update", error);
  }

  return {
    hasUpdate: undefined,
  };
}
