import { existsSync } from "fs-extra";
import { join } from "path";
import { logPromise } from "../async/logPromise";
import { raceWithTimeout } from "../async/raceWithTimeout";
import { readFromCache } from "../cache";
import { prompt } from "../prompt/prompt";
import { shouldPrompt } from "../prompt/shouldPrompt";
import { updateCachedPromptData } from "../prompt/updateCachedPromptData";
import { emphasize, highlight } from "../theme";
import { metadataPath, runtimeMetadata, runtimePath } from "./config";
import { debug } from "./debug";
import { getLatestRelease } from "./getLatestReleases";
import { installLatestRelease } from "./installLatestRelease";
import { parseBuildId } from "./parseBuildId";
import { MetadataJSON } from "./types";

const PROMPT_ID = "runtime-update";

export async function promptForUpdate() {
  const { path: executablePath } = runtimeMetadata;
  const runtimeExecutablePath = join(runtimePath, ...executablePath);
  let isRuntimeInstalled = existsSync(runtimeExecutablePath);

  const promise = getLatestRelease();

  logPromise({
    delayBeforeLoggingMs: 500,
    messages: {
      failed: "Couldn't download releases; will try again later.\n",
      pending: "Checking for Replay updates…",
    },
    promise,
  });

  let latestBuildId: string | undefined = undefined;
  let latestVersion: string | undefined = undefined;
  try {
    const latestRelease = await raceWithTimeout(promise, 10_000);

    latestBuildId = latestRelease?.buildId;
    latestVersion = latestRelease?.version ?? undefined;

    if (latestBuildId == null) {
      debug("No release found; skipping update check");
    }
  } catch (error) {
    // Ignore
  }

  if (latestBuildId) {
    const metadata = readFromCache<MetadataJSON>(metadataPath);
    const currentBuildId = metadata?.chromium?.buildId;
    if (currentBuildId) {
      debug("Current build id: %s", currentBuildId);
    } else {
      debug("Installed version metadata not found");
    }

    // If the user hasn't installed Replay runtime, they'll have to install it
    // Otherwise let's check for potential updates and ask them (at most) once per day
    let confirmed = !isRuntimeInstalled;
    if (
      currentBuildId !== latestBuildId &&
      shouldPrompt({
        id: PROMPT_ID,
        metadata: latestBuildId,
      })
    ) {
      const { releaseDate } = parseBuildId(latestBuildId);
      if (isRuntimeInstalled) {
        console.log("");
        console.log("A new version of Replay is available!");
        console.log("  Release date:", highlight(releaseDate.toLocaleDateString()));
        if (latestVersion) {
          console.log("  Version:", highlight(latestVersion));
        }
        console.log("");
        console.log(`Press ${emphasize("[Enter]")} to upgrade`);
        console.log("Press any other key to skip");
        console.log("");

        confirmed = await prompt();
      } else {
        console.log("");
        console.log("In order to record a Replay, you'll have to first install the browser.");
        console.log(`Press any key to continue`);
        console.log("");

        await prompt();
      }

      updateCachedPromptData({
        id: PROMPT_ID,
        metadata: latestBuildId,
      });

      if (confirmed) {
        await installLatestRelease();
        console.log("");
      }
    }
  }
}
