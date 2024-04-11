import { execSync } from "child_process";
import { version as currentVersion, name } from "../../../package.json";
import { shouldPrompt } from "../prompt/shouldPrompt";
import { debug } from "./debug";
import { UpdateCheck } from "./types";

const PROMPT_ID = "npm-update";

export async function checkForNpmUpdate(): Promise<UpdateCheck<string>> {
  try {
    const text = execSync(`npm info ${name} --json`, {
      encoding: "utf8",
      stdio: "pipe",
    }).trim();
    const { version: latestVersion } = JSON.parse(text);

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
