import { trackEvent } from "@replay-cli/shared/mixpanelClient";
import { emphasize } from "@replay-cli/shared/theme";
import { name as packageName } from "../../../package.json";
import { installRelease } from "../installation/installRelease";
import { prompt } from "../prompt/prompt";
import { updateCachedPromptData } from "../prompt/updateCachedPromptData";
import { Version } from "./checkForRuntimeUpdate";
import { UpdateCheckResult } from "./types";
import { getLatestRelease } from "../installation/getLatestReleases";

const PROMPT_ID = "runtime-update";

export async function promptForRuntimeUpdate(updateCheck: UpdateCheckResult<Version>) {
  const { fromVersion, toVersion } = updateCheck;

  // If the user hasn't installed Replay runtime, they'll have to install it
  // Otherwise let's check for potential updates and ask them (at most) once per day
  let confirmed = fromVersion == null;

  if (fromVersion) {
    if (!process.stdin.isTTY) {
      console.log("A new version of the Replay browser is available.");
      console.log(`Run "${emphasize(`${packageName} upgrade`)}" to update`);
    } else {
      console.log("");
      console.log(`A new version of the Replay browser is available.`);
      console.log(`Press ${emphasize("[Enter]")} to upgrade or press any other key to skip.`);
      console.log("");

      confirmed = await prompt();
    }
  } else {
    console.log("");
    console.log("In order to record a Replay, you'll have to first install the browser.");
    console.log(`Press any key to continue`);
    console.log("");

    await prompt();
  }

  updateCachedPromptData({
    id: PROMPT_ID,
    metadata: toVersion.buildId,
  });

  if (confirmed) {
    try {
      const latestRelease = await getLatestRelease();
      await installRelease({
        buildId: latestRelease.buildId,
        forkedVersion: latestRelease.version,
      });
    } catch (error) {
      // A failed update is not a critical error;
      // A failed install will be handled later
    }
  } else {
    trackEvent("update.runtime.skipped", { newRuntimeVersion: toVersion });
  }

  console.log("");
}
