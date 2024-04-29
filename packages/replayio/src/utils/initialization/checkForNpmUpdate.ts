import { version as currentVersion, name as packageName } from "../../package.js";
import { shouldPrompt } from "../prompt/shouldPrompt.js";
import { debug } from "./debug.js";
import { UpdateCheck } from "./types.js";

const PROMPT_ID = "npm-update";

export async function checkForNpmUpdate(): Promise<UpdateCheck<string>> {
  try {
    // https://github.com/npm/registry/blob/master/docs/responses/package-metadata.md#abbreviated-metadata-format
    const response = await fetch(`https://registry.npmjs.org/${packageName}`, {
      headers: {
        Accept: "application/vnd.npm.install-v1+json",
      },
    });
    const json: any = await response.json();
    const latestVersion = json["dist-tags"].latest;

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
