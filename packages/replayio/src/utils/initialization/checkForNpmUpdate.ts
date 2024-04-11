import { exec } from "child_process";
import { promisify } from "util";
import { version as currentVersion, name } from "../../../package.json";
import { shouldPrompt } from "../prompt/shouldPrompt";
import { debug } from "./debug";
import { UpdateCheck } from "./types";

const execAsync = promisify(exec);

const PROMPT_ID = "npm-update";

export async function checkForNpmUpdate(): Promise<UpdateCheck<string>> {
  try {
    const { stdout: text } = await execAsync(`npm info ${name} --json`, {
      encoding: "utf8",
    });
    const { version: latestVersion } = JSON.parse(text.trim());

    return {
      hasUpdate: currentVersion !== latestVersion,
      fromVersion: currentVersion,
      shouldShowPrompt: shouldPrompt({
        id: PROMPT_ID,
        metadata: latestVersion,
      }),
      toVersion: latestVersion,
    };
  } catch (error) {
    debug("Failed to check for npm update", error);
  }

  return {
    hasUpdate: undefined,
  };
}
