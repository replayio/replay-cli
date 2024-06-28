import { exitProcess } from "@replay-cli/shared/process/exitProcess";
import { registerCommand } from "../utils/commander/registerCommand";
import { checkAuthentication } from "../utils/initialization/checkAuthentication";
import { promptForAuthentication } from "../utils/initialization/promptForAuthentication";

registerCommand("login").description("Log into your Replay account (or register)").action(login);

async function login() {
  const authenticated = await checkAuthentication();
  if (authenticated) {
    console.log("You are already signed in!");
  } else {
    await promptForAuthentication();
  }

  await exitProcess(0);
}
