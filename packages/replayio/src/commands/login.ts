import { checkAuthentication } from "../utils/initialization/checkAuthentication";
import { promptForAuthentication } from "../utils/initialization/promptForAuthentication";
import { registerCommand } from "../utils/commander/registerCommand";
import { exitProcess } from "../utils/exitProcess";

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
