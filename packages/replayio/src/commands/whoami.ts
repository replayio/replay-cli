import { exitProcess } from "@replay-cli/shared/process/exitProcess";
import { registerCommand } from "../utils/commander/registerCommand";
import { whoami } from "../utils/whoami";

registerCommand("whoami", {
  checkForNpmUpdate: false,
  checkForRuntimeUpdate: false,
  requireAuthentication: false,
})
  .description("Display info about the current user")
  .action(command);

const DOCS_URL = "https://docs.replay.io/reference/api-keys";

async function command() {
  await whoami();

  await exitProcess(0);
}
