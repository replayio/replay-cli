import { registerAuthenticatedCommand } from "../utils/commander";
import { exitProcess } from "../utils/exitProcess";
import { installLatestRelease } from "../utils/installation/installLatestRelease";

registerAuthenticatedCommand("update")
  .description("Update your installed Replay browser")
  .action(update);

async function update() {
  try {
    await installLatestRelease();

    await exitProcess(0);
  } catch (error) {
    console.error(error);

    await exitProcess(1);
  }
}
