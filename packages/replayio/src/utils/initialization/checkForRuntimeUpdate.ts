import { existsSync } from "fs-extra";
import { join } from "path";
import { metadataPath, runtimeMetadata, runtimePath } from "../installation/config";
import { getLatestRelease } from "../installation/getLatestReleases";
import { MetadataJSON, Release } from "../installation/types";
import { readFromCache } from "../cache";
import { shouldPrompt } from "../prompt/shouldPrompt";
import { debug } from "./debug";
import { UpdateCheck } from "./types";

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

  const metadata = readFromCache<MetadataJSON>(metadataPath);
  const currentBuildId = metadata?.chromium?.buildId;
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
