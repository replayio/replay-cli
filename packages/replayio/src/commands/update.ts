import { registerCommand } from "../utils/commander/registerCommand";
import { exitProcess } from "../utils/exitProcess";
import { installLatestRelease } from "../utils/installation/installLatestRelease";

registerCommand("update", { requireAuthentication: true })
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
