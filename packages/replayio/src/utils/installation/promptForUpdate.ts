import { existsSync } from "fs-extra";
import { join } from "path";
import { readFromCache } from "../cache";
import { prompt } from "../prompt/prompt";
import { shouldPrompt } from "../prompt/shouldPrompt";
import { emphasize, highlight } from "../theme";
import { metadataPath, runtimeMetadata, runtimePath } from "./config";
import { debug } from "./debug";
import { getLatestRelease } from "./getLatestReleases";
import { installLatestRelease } from "./installLatestRelease";
import { parseBuildId } from "./parseBuildId";
import { MetadataJSON } from "./types";

const PROMPT_ID = "runtime-update";

export async function promptForUpdate() {
  const { path: executablePath, runtime } = runtimeMetadata;
  const runtimeExecutablePath = join(runtimePath, ...executablePath);
  let isRuntimeInstalled = existsSync(runtimeExecutablePath);

  // If the user hasn't installed Replay runtime, they'll have to install it
  // Otherwise let's check for potential updates and ask them (at most) once per day
  if (isRuntimeInstalled && !shouldPrompt(PROMPT_ID)) {
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

  let confirmed = !isRuntimeInstalled;
  if (currentBuildId !== latestBuildId) {
    const { releaseDate } = parseBuildId(latestBuildId);
    if (isRuntimeInstalled) {
      console.log("");
      console.log("A new version of Replay is available!");
      console.log("  Release date:", highlight(releaseDate.toLocaleDateString()));
      console.log("  Version:", highlight(latestRelease.version));
      console.log("");
      console.log(`Press ${emphasize("[Enter]")} to upgrade`);
      console.log("Press any other key to skip");
      console.log("");

      confirmed = await prompt({ id: PROMPT_ID });
    } else {
      console.log("");
      console.log("In order to record a Replay, you'll have to first install the browser.");
      console.log(`Press any key to continue`);
      console.log("");

      await prompt({ id: PROMPT_ID });
    }

    if (confirmed) {
      await installLatestRelease();
      console.log("");
    }
  }
}
