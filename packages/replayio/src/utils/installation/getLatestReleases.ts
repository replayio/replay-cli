import assert from "assert";
import fetch from "node-fetch";
import { replayAppHost } from "../../config.js";
import { runtimeMetadata } from "./config.js";
import { debug } from "./debug.js";
import { Release } from "./types.js";

const { platform, runtime } = runtimeMetadata;

export async function getLatestRelease() {
  debug("Fetching release metadata");

  const response = await fetch(`${replayAppHost}/api/releases`);
  const json = (await response.json()) as Release[];
  const latestRelease = json.find(release => {
    if (release.platform === platform && release.runtime === runtime) {
      if (platform === "macOS") {
        return process.arch.startsWith("arm") === release.releaseFile.includes("arm");
      } else {
        return true;
      }
    }
  });

  assert(latestRelease, `No release found for ${platform}:${runtime}`);

  debug("Latest release on", new Date(latestRelease.time).toLocaleDateString());

  return latestRelease;
}
