import { existsSync } from "fs-extra";
import { join } from "path";
import { runtimeMetadata, runtimePath } from "../installation/config";
import { getLatestRelease } from "../installation/getLatestReleases";
import { Release } from "../installation/types";
import { withTrackAsyncEvent } from "../mixpanel/withTrackAsyncEvent";
import { shouldPrompt } from "../prompt/shouldPrompt";
import { debug } from "./debug";
import { getCurrentRuntimeMetadata } from "./getCurrentRuntimeMetadata";
import { UpdateCheck } from "./types";

const PROMPT_ID = "runtime-update";

export type Version = {
  buildId: Release["buildId"];
  version: Release["version"];
};

export const checkForRuntimeUpdate = withTrackAsyncEvent(
  async function checkForRuntimeUpdate(): Promise<UpdateCheck<Version>> {
    let latestRelease: Release;
    let latestBuildId: string;
    try {
      latestRelease = await getLatestRelease();
      latestBuildId = latestRelease?.buildId ?? null;
      if (latestBuildId == null) {
        debug("No release found; skipping update check");

        return {
          hasUpdate: undefined,
        };
      }
    } catch (error) {
      debug("Release check failed:", error);

      return {
        hasUpdate: undefined,
      };
    }

    const { path: executablePath } = runtimeMetadata;
    const runtimeExecutablePath = join(runtimePath, ...executablePath);
    if (!existsSync(runtimeExecutablePath)) {
      return {
        hasUpdate: true,
        fromVersion: undefined,
        shouldShowPrompt: true,
        toVersion: { buildId: latestBuildId, version: latestRelease.version },
      };
    }

    const { buildId: currentBuildId } = getCurrentRuntimeMetadata("chromium") ?? {};
    if (currentBuildId) {
      debug("Current build id: %s", currentBuildId);
    } else {
      debug("Installed version metadata not found");
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
