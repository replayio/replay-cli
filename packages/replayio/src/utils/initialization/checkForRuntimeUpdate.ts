import { logger } from "@replay-cli/shared/logger";
import { createAsyncFunctionWithTracking } from "@replay-cli/shared/mixpanel/createAsyncFunctionWithTracking";
import { existsSync } from "fs-extra";
import { getBrowserPath } from "../browser/getBrowserPath";
import { getLatestRelease } from "../installation/getLatestReleases";
import { Release } from "../installation/types";
import { shouldPrompt } from "../prompt/shouldPrompt";
import { getCurrentRuntimeMetadata } from "./getCurrentRuntimeMetadata";
import { UpdateCheck } from "./types";

const PROMPT_ID = "runtime-update";

export type Version = {
  buildId: Release["buildId"];
  version: Release["version"];
};

export const checkForRuntimeUpdate = createAsyncFunctionWithTracking(
  async function checkForRuntimeUpdate(): Promise<UpdateCheck<Version>> {
    let latestRelease: Release;
    let latestBuildId: string;
    try {
      latestRelease = await getLatestRelease();
      latestBuildId = latestRelease?.buildId ?? null;
      if (latestBuildId == null) {
        logger.debug("No release found; skipping update check");

        return {
          hasUpdate: undefined,
        };
      }
    } catch (error) {
      logger.debug("Release check failed", { error });

      return {
        hasUpdate: undefined,
      };
    }

    if (!existsSync(getBrowserPath())) {
      return {
        hasUpdate: true,
        fromVersion: undefined,
        shouldShowPrompt: true,
        toVersion: { buildId: latestBuildId, version: latestRelease.version },
      };
    }

    const { buildId: currentBuildId } = getCurrentRuntimeMetadata("chromium") ?? {};
    if (currentBuildId) {
      logger.debug(`Current build id: ${currentBuildId}`);
    } else {
      logger.debug("Installed version metadata not found");
    }

    return {
      hasUpdate: currentBuildId !== latestBuildId,
      fromVersion: currentBuildId ? { buildId: currentBuildId, version: null } : undefined,
      shouldShowPrompt: shouldPrompt({
        id: PROMPT_ID,
        metadata: latestBuildId,
      }),
      toVersion: { buildId: latestBuildId, version: latestRelease.version },
    };
  },
  "update.runtime.check",
  result => ({
    hasUpdate: result?.hasUpdate,
    newBuildId: result?.hasUpdate ? result?.toVersion.buildId : null,
    newRuntimeVersion: result?.hasUpdate ? result?.toVersion.version : null,
    shouldShowPrompt: !!(result?.hasUpdate && result?.shouldShowPrompt),
  })
);
