import { existsSync } from "fs";
import { join } from "path";
import { runtimeMetadata, runtimePath } from "../installation/config.js";
import { getLatestRelease } from "../installation/getLatestReleases.js";
import { Release } from "../installation/types.js";
import { shouldPrompt } from "../prompt/shouldPrompt.js";
import { debug } from "./debug.js";
import { getCurrentRuntimeMetadata } from "./getCurrentRuntimeMetadata.js";
import { UpdateCheck } from "./types.js";

const PROMPT_ID = "runtime-update";

export type Version = {
  buildId: Release["buildId"];
  version: Release["version"];
};

export async function checkForRuntimeUpdate(): Promise<UpdateCheck<Version>> {
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
}
