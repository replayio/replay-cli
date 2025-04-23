import assert from "node:assert/strict";
import { fetch } from "undici";
import { replayAppHost } from "../config";
import { logDebug } from "../logger";
import { runtimeMetadata } from "./config";
import { Release } from "./types";

const { architecture, platform, runtime } = runtimeMetadata;

export async function getLatestRuntimeRelease() {
  logDebug("Fetching release metadata");

  const response = await fetch(`${replayAppHost}/api/releases`);
  const json = (await response.json()) as Release[];
  const latestRelease = json.find(
    release =>
      release.platform === platform &&
      release.runtime === runtime &&
      (release.architecture === architecture || release.architecture === "unknown")
  );

  logDebug("Latest release", { latestRelease });
  assert(latestRelease, `No release found for ${platform}:${runtime}`);

  return latestRelease;
}
