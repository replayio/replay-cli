import { logger } from "@replay-cli/shared/logger";
import assert from "node:assert/strict";
import { fetch } from "undici";
import { replayAppHost } from "../../config";
import { runtimeMetadata } from "./config";
import { Release } from "./types";

const { architecture, platform, runtime } = runtimeMetadata;

export async function getLatestRelease() {
  logger.debug("Fetching release metadata");

  const response = await fetch(`${replayAppHost}/api/releases`);
  const json = (await response.json()) as Release[];
  const latestRelease = json.find(
    release =>
      release.platform === platform &&
      release.runtime === runtime &&
      (release.architecture === architecture || release.architecture === "unknown")
  );

  logger.debug("Latest release", latestRelease);
  assert(latestRelease, `No release found for ${platform}:${runtime}`);

  return latestRelease;
}
