import { exitProcess } from "@replay-cli/shared/process/exitProcess";
import { registerCommand } from "../utils/commander/registerCommand";
import { whoami } from "../utils/whoami";

registerCommand("login", {
  requireAuthentication: true,
})
  .description("Log into your Replay account (or register)")
  .action(login);

async function login() {
  await whoami();

  await exitProcess(0);
}
