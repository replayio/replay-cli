import { logError } from "@replay-cli/shared/logger";
import { exitProcess } from "@replay-cli/shared/process/exitProcess";
import { statusSuccess } from "@replay-cli/shared/theme";
import { registerCommand } from "../utils/commander/registerCommand";
import { checkForNpmUpdate } from "../utils/initialization/checkForNpmUpdate";
import { checkForRuntimeUpdate } from "../utils/initialization/checkForRuntimeUpdate";
import { promptForNpmUpdate } from "../utils/initialization/promptForNpmUpdate";
import { installRelease } from "../utils/installation/installRelease";

registerCommand("update", {
  checkForRuntimeUpdate: false,
  checkForNpmUpdate: false,
})
  .description("Update Replay")
  .alias("install")
  .action(update);

async function update() {
  try {
    const [runtimeUpdateCheck, npmUpdateCheck] = await Promise.all([
      checkForRuntimeUpdate(),
      checkForNpmUpdate(),
    ]);

    if (runtimeUpdateCheck.hasUpdate && npmUpdateCheck.hasUpdate) {
      await installRelease(runtimeUpdateCheck.toVersion);
      await promptForNpmUpdate(npmUpdateCheck, false);
    } else if (npmUpdateCheck.hasUpdate) {
      console.log(statusSuccess("✔"), "You have the latest version of the Replay Browser");

      await promptForNpmUpdate(npmUpdateCheck, false);
    } else if (runtimeUpdateCheck.hasUpdate) {
      console.log(statusSuccess("✔"), "You have the latest version of replayio");

      await installRelease(runtimeUpdateCheck.toVersion);
    } else {
      console.log(
        statusSuccess("✔"),
        "You have the latest version of replayio and the Replay Browser"
      );
    }

    await exitProcess(0);
  } catch (error) {
    logError("Update:Failed", { error });
    console.error(error);

    await exitProcess(1);
  }
}
