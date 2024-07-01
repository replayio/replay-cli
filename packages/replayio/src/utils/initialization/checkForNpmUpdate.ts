import { logger } from "@replay-cli/shared/logger";
import { createAsyncFunctionWithTracking } from "@replay-cli/shared/mixpanel/createAsyncFunctionWithTracking";
import { fetch } from "undici";
import { version as currentVersion, name as packageName } from "../../../package.json";
import { shouldPrompt } from "../prompt/shouldPrompt";
import { UpdateCheck } from "./types";

const PROMPT_ID = "npm-update";

export const checkForNpmUpdate = createAsyncFunctionWithTracking(
  async function checkForNpmUpdate(): Promise<UpdateCheck<string>> {
    try {
      // https://github.com/npm/registry/blob/master/docs/responses/package-metadata.md#abbreviated-metadata-format
      const response = await fetch(`https://registry.npmjs.org/${packageName}`, {
        headers: {
          Accept: "application/vnd.npm.install-v1+json",
        },
      });
      const json: any = await response.json();
      const latestVersion = json["dist-tags"].latest;

      return {
        hasUpdate: currentVersion !== latestVersion,
        fromVersion: currentVersion,
        shouldShowPrompt: shouldPrompt({
          id: PROMPT_ID,
          metadata: latestVersion,
        }),
        toVersion: latestVersion,
      };
    } catch (error) {
      logger.debug("Failed to check for npm update", { error });
    }

    return {
      hasUpdate: undefined,
    };
  },
  "update.npm.check",
  result => ({
    hasUpdate: result?.hasUpdate,
    newPackageVersion: result?.hasUpdate ? result?.toVersion : null,
    shouldShowPrompt: !!(result?.hasUpdate && result?.shouldShowPrompt),
  })
);
