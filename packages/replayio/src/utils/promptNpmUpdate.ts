import { exec } from "child_process";
import { promisify } from "util";
import { version as currentVersion, name } from "../../package.json";
import { logPromise } from "./async/logPromise";
import { raceWithTimeout } from "./async/raceWithTimeout";
import { prompt } from "./prompt/prompt";
import { shouldPrompt } from "./prompt/shouldPrompt";
import { updateCachedPromptData } from "./prompt/updateCachedPromptData";
import { highlight } from "./theme";

const execAsync = promisify(exec);

const PROMPT_ID = "npm-update";

export async function promptNpmUpdate() {
  try {
    const promise = execAsync(`npm info ${name} --json`, {
      encoding: "utf8",
    });

    logPromise({
      delayBeforeLoggingMs: 500,
      messages: {
        failed: "Couldn't connect to NPM; will try again later.\n",
        pending: "Checking for NPM updates…",
      },
      promise,
    });

    let latestVersion: string | undefined = undefined;
    try {
      const { stdout: text } = await raceWithTimeout(promise, 10_000);
      const json = JSON.parse(text.trim());

      latestVersion = json.version;
    } catch (error) {
      // Ignore
    }

    if (
      latestVersion != null &&
      currentVersion !== latestVersion &&
      shouldPrompt({
        id: PROMPT_ID,
        metadata: latestVersion,
      })
    ) {
      console.log("A new version of replayio is available!");
      console.log("  Installed version:", highlight(currentVersion));
      console.log("  New version:", highlight(latestVersion));
      console.log("");
      console.log("To upgrade, run the following:");
      console.log(highlight(`  npm install -g ${name}`));
      console.log("");
      console.log("Press any key to continue");
      console.log("");

      await prompt();

      updateCachedPromptData({
        id: PROMPT_ID,
        metadata: latestVersion,
      });
    }
  } catch (error) {
    console.error(error);
  }
}
