import { registerCommand } from "../utils/commander/registerCommand.js";
import { exitProcess } from "../utils/exitProcess.js";
import { checkForNpmUpdate } from "../utils/initialization/checkForNpmUpdate.js";
import { checkForRuntimeUpdate } from "../utils/initialization/checkForRuntimeUpdate.js";
import { promptForNpmUpdate } from "../utils/initialization/promptForNpmUpdate.js";
import { installLatestRelease } from "../utils/installation/installLatestRelease.js";
import { statusSuccess } from "../utils/theme.js";

registerCommand("update", {
  checkForRuntimeUpdate: false,
  checkForNpmUpdate: false,
})
  .description("Update Replay")
  .action(update);

async function update() {
  try {
    const [runtimeUpdateCheck, npmUpdateCheck] = await Promise.all([
      checkForRuntimeUpdate(),
      checkForNpmUpdate(),
    ]);

    if (runtimeUpdateCheck.hasUpdate && npmUpdateCheck.hasUpdate) {
      await installLatestRelease();
      await promptForNpmUpdate(npmUpdateCheck, false);
    } else if (npmUpdateCheck.hasUpdate) {
      console.log(statusSuccess("✔"), "You have the latest version of the Replay Browser");

      await promptForNpmUpdate(npmUpdateCheck, false);
    } else if (runtimeUpdateCheck.hasUpdate) {
      console.log(statusSuccess("✔"), "You have the latest version of replayio");

      await installLatestRelease();
    } else {
      console.log(
        statusSuccess("✔"),
        "You have the latest version of replayio and the Replay Browser"
      );
    }

    await exitProcess(0);
  } catch (error) {
    console.error(error);

    await exitProcess(1);
  }
}
