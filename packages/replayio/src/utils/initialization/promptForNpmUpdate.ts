import { name as packageName } from "../../../package.json";
import { prompt } from "../prompt/prompt";
import { updateCachedPromptData } from "../prompt/updateCachedPromptData";
import { highlight } from "../theme";
import { UpdateCheckResult } from "./types";

const PROMPT_ID = "npm-update";

export async function promptForNpmUpdate(updateCheck: UpdateCheckResult<string>) {
  const { fromVersion, toVersion } = updateCheck;

  console.log("");
  console.log("A new version of replayio is available!");
  console.log("  Installed version:", highlight(fromVersion));
  console.log("  New version:", highlight(toVersion));
  console.log("");
  console.log("To upgrade, run the following:");
  console.log(highlight(`  npm install --global ${packageName}@${toVersion}`));
  console.log("");

  if (process.stdin.isTTY) {
    console.log("Press any key to continue");
    console.log("");

    await prompt();
  }

  updateCachedPromptData({
    id: PROMPT_ID,
    metadata: toVersion,
  });
}
