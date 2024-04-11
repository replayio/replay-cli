import { name as packageName } from "../../../package.json";
import { prompt } from "../prompt/prompt";
import { updateCachedPromptData } from "../prompt/updateCachedPromptData";
import { highlight } from "../theme";
import { getPackageManagerCommand } from "./getPackageManagerCommand";
import { UpdateCheckResult } from "./types";

const PROMPT_ID = "npm-update";

export async function promptForNpmUpdate(updateCheck: UpdateCheckResult<string>) {
  const { fromVersion, toVersion } = updateCheck;

  const command = getPackageManagerCommand();
  if (command) {
    let baseCommand;
    switch (command) {
      case "npm": {
        baseCommand = "npm install --global";
        break;
      }
      case "pnpm": {
        baseCommand = "pnpm install --global";
        break;
      }
      case "yarn": {
        // Only supported by Yarn 1.0
        baseCommand = "yarn global";
        break;
      }
    }

    console.log("");
    console.log("A new version of replayio is available!");
    console.log("  Installed version:", highlight(fromVersion));
    console.log("  New version:", highlight(toVersion));
    console.log("");
    console.log("To upgrade, run the following:");
    console.log(highlight(`  ${baseCommand} ${packageName}`));
    console.log("");
    console.log("Press any key to continue");
    console.log("");

    await prompt();

    updateCachedPromptData({
      id: PROMPT_ID,
      metadata: toVersion,
    });
  }
}
