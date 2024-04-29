import { name as packageName } from "../../package.js";
import { installLatestRelease } from "../installation/installLatestRelease.js";
import { prompt } from "../prompt/prompt.js";
import { updateCachedPromptData } from "../prompt/updateCachedPromptData.js";
import { emphasize } from "../theme.js";
import { Version } from "./checkForRuntimeUpdate.js";
import { UpdateCheckResult } from "./types.js";

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
      await installLatestRelease();
    } catch (error) {
      // A failed update is not a critical error;
      // A failed install will be handled later
    }
  }

  console.log("");
}
