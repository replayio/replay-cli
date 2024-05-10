import assert from "assert";
import fetch from "node-fetch";
import { replayAppHost } from "../../config";
import { runtimeMetadata } from "./config";
import { debug } from "./debug";
import { Release } from "./types";

const { platform, runtime, architecture } = runtimeMetadata;

export async function getLatestRelease() {
  debug("Fetching release metadata");

  const response = await fetch(`${replayAppHost}/api/releases`);
  const json = (await response.json()) as Release[];
  const latestRelease = json.find(
    release =>
      release.platform === platform &&
      release.runtime === runtime &&
      // TODO(dmiller): remove this null check once we have done a release with the architecture field
      (release.architecture === architecture || release.architecture === null)
  );

  debug("Latest release", latestRelease);
  assert(latestRelease, `No release found for ${platform}:${runtime}`);

  debug("Latest release on", new Date(latestRelease.time).toLocaleDateString());

  return latestRelease;
}
