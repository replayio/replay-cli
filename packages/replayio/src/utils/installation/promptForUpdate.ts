import chalk from "chalk";
import { readFromCache } from "../cache";
import { prompt } from "../prompt/prompt";
import { shouldPrompt } from "../prompt/shouldPrompt";
import { metadataPath } from "./config";
import { debug } from "./debug";
import { getLatestRelease } from "./getLatestReleases";
import { installLatestRelease } from "./installLatestRelease";
import { parseBuildId } from "./parseBuildId";
import { MetadataJSON } from "./types";

const PROMPT_ID = "runtime-update";

export async function promptForUpdate() {
  if (!shouldPrompt(PROMPT_ID)) {
    return;
  }

  const latestRelease = await getLatestRelease();
  const latestBuildId = latestRelease?.buildId ?? null;
  if (latestBuildId == null) {
    debug("No release found; skipping update check");
    return;
  }

  const metadata = readFromCache<MetadataJSON>(metadataPath);
  const currentBuildId = metadata?.chromium?.buildId;
  if (currentBuildId) {
    debug("Current build id: %s", currentBuildId);
  } else {
    debug("Installed version metadata not found");
  }

  if (currentBuildId !== latestBuildId) {
    const { releaseDate } = parseBuildId(latestBuildId);
    console.log("");
    console.log("A new version of Replay is available!");
    console.log("  Release date:", chalk.blueBright(releaseDate.toLocaleDateString()));
    console.log("  Version:", chalk.blueBright(latestRelease.version));
    console.log("");
    console.log(`Press ${chalk.bold("[Enter]")} to upgrade`);
    console.log("Press any other key to skip");
    console.log("");

    const confirmed = await prompt(PROMPT_ID);
    if (confirmed) {
      await installLatestRelease();
      console.log("");
    }
  }
}
