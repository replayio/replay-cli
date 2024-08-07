import { logDebug, logError, logInfo } from "@replay-cli/shared/logger";
import { createAsyncFunctionWithTracking } from "@replay-cli/shared/mixpanelClient";
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
        logInfo("CheckForRuntimeUpdate:NoReleaseFound");

        return {
          hasUpdate: undefined,
        };
      }
    } catch (error) {
      logError("CheckForRuntimeUpdate:Failed", { error });

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
    logDebug("CheckForRuntimeUpdate:CurrentBuild", { currentBuildId, latestBuildId });

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
